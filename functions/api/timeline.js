// Cloudflare Pages Functions
// /api/timeline
// コスト最適化版
// - Haiku利用
// - Prompt短縮
// - max_tokens削減
// - KVキャッシュ対応

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const body = await request.json();

    const {
      themeId,
      themeName,
      keywords,
      previousData,
      period,
    } = body;

    if (!themeId || !themeName || !keywords) {
      return new Response(
        JSON.stringify({
          error: "必要なパラメータが不足しています",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...corsHeaders,
          },
        }
      );
    }

    const apiKey = env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "APIキーが設定されていません",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...corsHeaders,
          },
        }
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const targetPeriod = period ? period.label : today;
    const isPast = !!period;

    const cacheKey = `timeline:${themeId}:${targetPeriod}`;

    // --------------------------
    // KVキャッシュ確認
    // --------------------------
    if (env.NEWS_KV) {
      const cached = await env.NEWS_KV.get(cacheKey);

      if (cached) {
        return new Response(cached, {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...corsHeaders,
          },
        });
      }
    }

    const lastEntry =
      previousData &&
      previousData.length > 0
        ? previousData[previousData.length - 1]
        : null;

    // --------------------------
    // 短縮Prompt
    // --------------------------
    const systemPrompt = `
指定テーマについてウェブ検索し、
その期間の主要動向を要約してください。

必ずJSONのみ返してください。

{
  "headline":"",
  "url":"",
  "source":"",
  "summary":"",
  "diff":""
}
`;

    const userPrompt = `
テーマ: ${themeName}

キーワード:
${keywords}

期間:
${targetPeriod}

${isPast ? "過去時点の状況を調査してください。" : "最新状況を調査してください。"}

前回状況:
${lastEntry ? lastEntry.summary : "なし"}

JSONのみ返してください。
`;

    const apiRes = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku",

          max_tokens: 300,

          system: systemPrompt,

          messages: [
            {
              role: "user",
              content: userPrompt,
            },
          ],

          tools: [
            {
              type: "web_search_20250305",
              name: "web_search",
            },
          ],
        }),
      }
    );

    if (!apiRes.ok) {
      const errText = await apiRes.text();

      return new Response(
        JSON.stringify({
          error: "AI分析サービスでエラーが発生しました",
          detail: errText.slice(0, 300),
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...corsHeaders,
          },
        }
      );
    }

    const data = await apiRes.json();

    const fullText = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const braceIdx = fullText.indexOf("{");

    let json;

    try {
      if (braceIdx >= 0) {
        let depth = 0;
        let endIdx = -1;

        for (let i = braceIdx; i < fullText.length; i++) {
          if (fullText[i] === "{") depth++;

          if (fullText[i] === "}") {
            depth--;

            if (depth === 0) {
              endIdx = i;
              break;
            }
          }
        }

        json = JSON.parse(
          fullText.slice(braceIdx, endIdx + 1)
        );
      } else {
        throw new Error("JSON not found");
      }
    } catch (e) {
      return new Response(
        JSON.stringify({
          error: "分析結果の解析に失敗しました",
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...corsHeaders,
          },
        }
      );
    }

    const entry = {
      date: targetPeriod,
      isPast,
      headline: json.headline || "",
      url: json.url || "#",
      source: json.source || "AI調査",
      summary: json.summary || "",
      diff: json.diff || "",
    };

    const resultJson = JSON.stringify({
      entry,
    });

    // --------------------------
    // KVキャッシュ保存（30日）
    // --------------------------
    if (env.NEWS_KV) {
      await env.NEWS_KV.put(
        cacheKey,
        resultJson,
        {
          expirationTtl: 60 * 60 * 24 * 30,
        }
      );
    }

    return new Response(resultJson, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...corsHeaders,
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: "サーバーエラーが発生しました",
        detail: String(e),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...corsHeaders,
        },
      }
    );
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
