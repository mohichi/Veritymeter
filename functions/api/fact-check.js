// Cloudflare Pages Functions - fact-check.js
// うわさ・デマ・都市伝説の真偽をAIが検証する
// コスト削減：web_searchなし、Haiku、max_tokens 600

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const body = await request.json();
    const { claim } = body;

    if (!claim || claim.trim().length === 0) {
      return new Response(JSON.stringify({ error: "検証する内容を入力してください" }), {
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

    const systemPrompt = `情報検証AIです。入力されたうわさ・デマ・都市伝説の真偽を検証しJSONのみ返答。最初の文字は必ず「{」。

JSON形式：
{"verdict":"true/false/partial/unknown","verdict_label":"本当/誤り/一部誤り/不明","summary":"検証結果の要約(60字以内)","detail":"詳しい説明(120字以内)","why_believed":"なぜ信じられやすいか(60字以内)","category":"健康/科学/歴史/社会/食べ物/その他"}

verdict基準：
- true：科学的・歴史的に正しい
- false：明確に誤り・デマ
- partial：一部は正しいが誤解を含む
- unknown：現時点では断定できない`;

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: "user", content: `検証：「${claim.trim()}」` }],
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return new Response(JSON.stringify({ error: "AI検証サービスでエラーが発生しました" }), {
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
      return new Response(JSON.stringify({ error: "検証結果の解析に失敗しました" }), {
        status: 502,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: "サーバーエラーが発生しました" }), {
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
