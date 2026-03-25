// ── PILOTS_DATA.js ──────────────────────────────────────────────────────────
// Static flight crew roster for Turtle Ranking.
// Edit this file to add/remove/update pilots.
// Fields: name, base

export const PILOTS = [
	// ── TSA ─────────────────────────────────────────────────────────────────
	{ name: "疫🐢便", base: "TSA" }, //卞學懿
	{ name: "夜🐢靈", base: "TSA" }, //凌敬業
	{ name: "煩🐢瘤", base: "TSA" }, //劉世凡
	{ name: "雨🐢味", base: "TSA" }, //魏鎮宇
	{ name: "江🐢李", base: "TSA" }, //李震疆
	{ name: "妹", base: "TSA" }, //MAY, CHO WIN
	{ name: "薄娶", base: "TSA" }, //曲柏
	{ name: "輪🐢鋁", base: "TSA" }, //呂忠倫
	{ name: "影🐢呂", base: "TSA" }, //呂欣穎
	{ name: "志🐢裡", base: "TSA" }, //李偉智
	{ name: "翔🐢夢", base: "TSA" }, //孟繁祥
	{ name: "羞🐢淋", base: "TSA" }, //林伯修
	{ name: "蹤🐢臨", base: "TSA" }, //林耀宗
	{ name: "國🐢秋", base: "TSA" }, //邱振國
	{ name: "顆🐢斤", base: "TSA" }, //金軻
	{ name: "汗🐢狐", base: "TSA" }, //胡廣漢
	{ name: "恩🐢嗡", base: "TSA" }, //翁梓恩
	{ name: "輪🐢嗡", base: "TSA" }, //翁緯倫
	{ name: "答🐢腸", base: "TSA" }, //常可達
	{ name: "微🐢彰", base: "TSA" }, //張皓惟
    { name: "餘🐢鍋", base: "TSA" }, //郭子瑜
	{ name: "州🐢塵", base: "TSA" }, //陳柏州
	{ name: "憑🐢陳", base: "TSA" }, //陳凱平
	{ name: "濡🐢菜", base: "TSA" }, //蔡依儒
	{ name: "輕🐢瞪", base: "TSA" }, //鄧旭清
	{ name: "熊🐢炎", base: "TSA" }, //閻世雄
	{ name: "宴🐢增", base: "TSA" }, //曾春彥
    { name: "輛🐢承", base: "TSA" }, //程聖亮
	{ name: "量🐢磺", base: "TSA" }, //黃裕亮
	{ name: "颱🐢洋", base: "TSA" }, //楊湘台
	{ name: "崗🐢羊", base: "TSA" }, //楊繼剛
	{ name: "鳴🐢蟹", base: "TSA" }, //謝黎明

	// ── RMQ ─────────────────────────────────────────────────────────────────
	{ name: "紅🐢亡", base: "RMQ" }, //王文鴻
	{ name: "偎🐢王", base: "RMQ" }, //王鴻威
	{ name: "彰🐢粥", base: "RMQ" }, //周秉章
	{ name: "餘🐢陳", base: "RMQ" }, //陳士瑜
	{ name: "搖🐢晨", base: "RMQ" }, //陳子堯
	{ name: "尾沉", base: "RMQ" }, //陳瑋
	{ name: "治🐢假", base: "RMQ" }, //賈雲志
	{ name: "熊🐢戴", base: "RMQ" }, //戴志雄
	{ name: "鬆🐢洩", base: "RMQ" }, //謝一菘
    { name: "駿", base: "RMQ" }, //湯川潤

	// ── KHH ─────────────────────────────────────────────────────────────────
	{ name: "誠🐢茅", base: "KHH" }, //毛志成
	{ name: "羞🐢亡", base: "KHH" }, //王逸修
	{ name: "殯🐢壺", base: "KHH" }, //胡瑞斌
    { name: "冥🐢許", base: "KHH" }, //許益銘
	{ name: "剩🐢許", base: "KHH" }, //許斐勝
	{ name: "發🐢瞧", base: "KHH" }, //喬鴻發
    { name: "牆🐢煌", base: "KHH" }, //黃少強
	{ name: "剩🐢鄒", base: "KHH" }, //鄒宏盛
	{ name: "終🐢料", base: "KHH" }, //廖瑞忠
    { name: "西🐢酥", base: "KHH" }, //蘇文熙
];

// Grouped by base — used for <optgroup> in the dropdown
export const PILOTS_BY_BASE = PILOTS.reduce((acc, p) => {
	if (!acc[p.base]) acc[p.base] = [];
	acc[p.base].push(p);
	return acc;
}, {});

// Lookup by name — used when resolving pilot details from a stored pilot_name
export const PILOT_BY_NAME = Object.fromEntries(PILOTS.map((p) => [p.name, p]));
