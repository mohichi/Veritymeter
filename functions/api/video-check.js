// Cloudflare Pages Functions - video-check.js
// YouTubeのURLからSupadata APIでトランスクリプトを取得し、
// Claude Haikuで内容の信憑性を分析する
// コスト削減：web_searchなし、Haiku、max_tokens 800

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// YouTubeのURLからビデオIDを抽出
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Supadata APIでトランスクリプトを取得
async function fetchTranscript(videoId, apiKey) {
  try {
    const res = await fetch(
      `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&text=true`,
      {
        headers: { "x-api-key": apiKey },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `Supadata API error (${res.status}): ${err.slice(0, 200)}` };
    }
    const data = await res.json();
    // text=trueの場合、contentがテキスト文字列で返る
    const text = typeof data.content === 'string'
      ? data.content
      : (data.content || []).map(s => s.text).join(' ');
    if (!text || text.trim().length === 0) {
      return { ok: false, error: "この動画にはトランスクリプトがありません（字幕なし・非対応の言語）" };
    }
    return { ok: true, text: text.slice(0, 4000), lang: data.lang || 'unknown' };
  } catch (e) {
    return { ok: false, error: `トランスクリプト取得エラー: ${String(e)}` };
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { url } = body;

    if (!url || !url.trim()) {
      return new Response(JSON.stringify({ error: "YouTubeのURLを入力してください" }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
      });
    }

    const videoId = extractVideoId(url.trim());
    if (!videoId) {
      return new Response(JSON.stringify({ error: "有効なYouTubeのURLを入力してください" }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
      });
    }

    const supadataKey = env.SUPADATA_API_KEY;
    const anthropicKey = env.ANTHROPIC_API_KEY;

    if (!supadataKey || !anthropicKey) {
      return new Response(JSON.stringify({ error: "APIキーが設定されていません" }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
      });
    }

    // ①トランスクリプト取得
    const transcript = await fetchTranscript(videoId, supadataKey);
    if (!transcript.ok) {
      return new Response(JSON.stringify({ error: transcript.error }), {
        status: 422,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
      });
    }

    // ②Claude Haikuで分析
    const systemPrompt = `動画内容の信憑性診断AIです。提供されたトランスクリプトを分析しJSONのみ返答。最初の文字は必ず「{」。

JSON形式：
{"title":"動画の内容を表す簡潔なタイトル(30字以内)","score":数値(0-100),"verdict":"判定(10字以内)","summary":"評価2文","positives":[{"text":"信頼できる点"}],"warnings":[{"text":"注意点"}],"verdict_full":"総評2文","tags":["タグ"],"content_type":"動画の種類（ニュース/解説/意見/エンタメ/その他）"}

スコア：80-100=根拠明確、60-79=概ね妥当、40-59=事実と憶測混在、20-39=根拠薄い、0-19=重大な問題`;

    const userContent = `YouTube動画のトランスクリプト（字幕テキスト）：

${transcript.text}

このトランスクリプトの内容を信憑性の観点から分析してください。`;

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return new Response(JSON.stringify({ error: "AI分析サービスでエラーが発生しました" }), {
        status: 502,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
      });
    }

    const data = await apiRes.json();
    const fullText = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n");

    const braceIdx = fullText.indexOf('{');
    let json;
    try {
      if (braceIdx >= 0) {
        let depth = 0, endIdx = -1;
        for (let i = braceIdx; i < fullText.length; i++) {
          if (fullText[i] === '{') depth++;
          else if (fullText[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
        }
        json = JSON.parse(fullText.slice(braceIdx, endIdx + 1));
      } else throw new Error("JSON not found");
    } catch (e) {
      return new Response(JSON.stringify({ error: "分析結果の解析に失敗しました" }), {
        status: 502,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
      });
    }

    // トランスクリプト情報も付加
    json.transcript_length = transcript.text.length;
    json.lang = transcript.lang;
    json.video_id = videoId;

    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: "サーバーエラーが発生しました", detail: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
