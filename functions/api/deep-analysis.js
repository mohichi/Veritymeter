// Cloudflare Pages Functions
// /api/deep-analysis
// 記事の心理学的・行動経済学的観点からの深層分析を行う

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const body = await request.json();
    const { url } = body;

    if (!url || !url.startsWith("http")) {
      return new Response(JSON.stringify({ error: "正しいURLを指定してください" }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
      });
    }

    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "APIキーが設定されていません" }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
      });
    }

    const systemPrompt = `メディアリテラシー・心理学・行動経済学の専門家AIです。URLの記事を深層分析しJSONのみ返答。最初の文字は必ず「{」。

JSON形式：
{"psychological_biases":[{"name":"バイアス名","description":"この記事での使われ方(40字)","severity":"high/medium/low"}],"fact_opinion_separation":{"facts":"事実の数と例(30字)","opinions":"意見の数と例(30字)","unverifiable":"検証困難の数と例(30字)"},"emotional_manipulation":{"detected":true/false,"techniques":["技法"],"examples":"具体例(50字)"},"missing_perspectives":{"exists":true/false,"description":"欠けている視点(50字)","counterargument":"反対意見(60字)"},"author_intent":{"primary_goal":"主な意図(25字)","target_emotion":"喚起する感情(15字)","call_to_action":"期待する行動(25字)"},"literacy_tips":["注意点(35字)"]}`;

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: `深層分析：${url}` }],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return new Response(JSON.stringify({ error: "AI分析サービスでエラーが発生しました", detail: errText.slice(0, 300) }), {
        status: 502,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
      });
    }

    const data = await apiRes.json();
    const fullText = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    // {から始まるJSONを直接抽出
    const braceIdx = fullText.indexOf('{');
    let json;
    try {
      if (braceIdx >= 0) {
        let depth = 0;
        let endIdx = -1;
        for (let i = braceIdx; i < fullText.length; i++) {
          if (fullText[i] === '{') depth++;
          else if (fullText[i] === '}') {
            depth--;
            if (depth === 0) { endIdx = i; break; }
          }
        }
        json = JSON.parse(fullText.slice(braceIdx, endIdx + 1));
      } else {
        throw new Error("JSON not found");
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: "分析結果の解析に失敗しました" }), {
        status: 502,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
      });
    }

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
