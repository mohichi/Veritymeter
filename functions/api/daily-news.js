// Cloudflare Pages Functions
// /api/daily-news
// Cron Worker（veritymeter-cron）が書き込んだKVストレージ（NEWS_KV）から
// 本日のメディア別ニュース一覧を読み込んで返す。
//
// 重要：この機能を使うには、Pagesプロジェクトの Settings > Functions > KV namespace bindings で
// "NEWS_KV" という名前で、Cron Worker側と同じKV Namespaceを紐付ける必要があります。

export async function onRequestGet(context) {
  const { env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };

  try {
    if (!env.NEWS_KV) {
      return new Response(
        JSON.stringify({ error: "NEWS_KVが設定されていません。Cloudflare Pagesの設定でKV bindingを追加してください。" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const data = await env.NEWS_KV.get("latest");

    if (!data) {
      return new Response(
        JSON.stringify({ error: "本日のデータはまだ準備されていません。しばらくしてから再度お試しください。" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(data, {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "サーバーエラーが発生しました", detail: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}
