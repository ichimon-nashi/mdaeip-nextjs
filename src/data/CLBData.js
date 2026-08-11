// TARGET PATH: src/data/CLBData.js
//
// Source: 華信航空 CCOM 客艙組員作業手冊 CH7 飛航作業程序 7.11 客艙缺失處理
// EF-02 附件：CLB 缺失紀錄技巧常用範例 (rev 042, 生效日期 2025/10/20)
//
// A `param: true` entry needs a value filled in after selection (a number
// for CLB_STATUSES, a free phase name for the "DURING ..." time entry).
// A `placeholder: true` location entry has no enumerable value (seat rows,
// door numbers, galley numbers vary per aircraft/flight) — the UI inserts
// a bracketed token like "(SEAT ROW)" for the crew member to fill in by
// hand rather than asking them to type it in the app.
//
// CLB_ITEMS carries a `group` key used only to section step 2 of the UI —
// grouping is my own read of the manual for browsability, not something
// the CCOM itself defines. Re-sort if a different grouping reads better
// to actual crew.

export const CLB_ITEM_GROUPS = [
	{ key: "skip", label: "略過 SKIP" },
	{ key: "door", label: "艙門/逃生窗 EXIT" },
	{ key: "safetypin", label: "安全插銷 SAFETY PIN" },
	{ key: "general", label: "一般客艙品項 GENERAL CABIN ITEMS" },
	{ key: "seat", label: "旅客/組員 座椅 PAX/CREW SEAT" },
	{ key: "lav", label: "廁所 LAV" },
	{ key: "galley", label: "廚房 GALLEY" },
	{ key: "cargo", label: "貨艙 CARGO" },
	{ key: "panel", label: "面板/指示燈/標示 PANEL/INDICATOR/PLACARD" },
	{ key: "other", label: "其他 MISC." },
];

export const CLB_LOCATIONS = [
	{
		zh: "前方",
		en: "FWD",
	},
	{
		zh: "中間",
		en: "MIDDLE",
	},
	{
		zh: "後方",
		en: "AFT",
	},
	{
		zh: "上方",
		en: "UPPER",
	},
	{
		zh: "下方",
		en: "LOWER",
	},
	{
		zh: "左側",
		en: "LEFT-HAND SIDE",
	},
	{
		zh: "右側",
		en: "RIGHT-HAND SIDE",
	},
	{
		zh: "內側",
		en: "INNER",
	},
	{
		zh: "外側",
		en: "OUTER",
	},
	{
		zh: "客艙",
		en: "CABIN",
	},
	{
		zh: "指定位置",
		en: "(編號/位置)",
		placeholder: true,
	},
	{
		zh: "裝載/增補",
		en: "UPLOAD (數量)",
		placeholder: true,
	},
	{
		zh: "卸下",
		en: "OFFLOAD (數量)",
		placeholder: true,
	},
];

export const CLB_ITEMS = [
	//艙門 DOOR
	{
		zh: "門鎖",
		en: "DOOR LATCH",
		group: "door",
	},
	{
		zh: "門鎖顯示",
		en: "DOOR LATCH VISUAL INDICATOR",
		group: "door",
	},
	{
		zh: "鉸鏈",
		en: "DOOR HINGE",
		group: "door",
	},
	//安全插銷 SAFETY PIN
	{
		zh: "插銷",
		en: "SAFETY PIN",
		group: "safetypin",
	},
	{
		zh: "安全繩",
		en: "LANYARD",
		group: "safetypin",
	},
	{
		zh: "飄帶",
		en: "STREAMER",
		group: "safetypin",
	},

	//一般客艙品項 GENERAL CABIN ITEMS
	{
		zh: "餐桌",
		en: "TRAY TABLE",
		group: "general",
	},
	{
		zh: "客艙置物櫃",
		en: "OVERHEAD BIN",
		group: "general",
	},
	{
		zh: "地毯",
		en: "CARPET",
		group: "general",
	},
	{
		zh: "冷氣孔",
		en: "GASPER VALVE",
		group: "general",
	},
	{
		zh: "地板緊急燈光冷光條",
		en: "PHOTOLUMINESCENT FLOOR PATH MARKING",
		group: "general",
	},
	//座椅 SEAT
	{
		zh: "組員座椅",
		en: "CREW JUMPSEAT",
		group: "seat",
	},
	{
		zh: "旅客座椅",
		en: "PAX SEAT",
		group: "seat",
	},
	{
		zh: "椅袋",
		en: "SEAT POCKET",
		group: "seat",
	},
	{
		zh: "扶手",
		en: "ARMREST",
		group: "seat",
	},
	{
		zh: "扶手塑膠蓋板",
		en: "ARMREST RUBBER COVER",
		group: "seat",
	},
	{
		zh: "肩帶",
		en: "SHOULDER HARNESS",
		group: "seat",
	},
	{
		zh: "椅背傾倒功能",
		en: "SEAT RECLINE MECHANISM",
		group: "seat",
	},
	{
		zh: "安全帶固定件(金屬件)",
		en: "SEATBELT BUCKLE",
		group: "seat",
	},
	{
		zh: "安全帶織帶(布件)",
		en: "SEATBELT WEBBING",
		group: "seat",
	},

	//廁所 LAV
	{
		zh: "廁所門鎖",
		en: "LAV DOOR LOCK",
		group: "lav",
	},
	{
		zh: "廁所菸灰缸",
		en: "LAV DOOR ASHTRAY",
		group: "lav",
	},
	{
		zh: "洗手間煙霧偵測器",
		en: "LAV SMOKE DETECTOR",
		group: "lav",
	},
	{
		zh: "馬桶座椅",
		en: "TOILET SEAT",
		group: "lav",
	},
	{
		zh: "馬桶座椅蓋板",
		en: "TOILET SEAT COVER",
		group: "lav",
	},
	{
		zh: "馬桶水龍頭",
		en: "LAV FAUCET",
		group: "lav",
	},
	{
		zh: "馬桶水槽",
		en: "LAV SINK",
		group: "lav",
	},
	{
		zh: "廁所垃圾桶蓋板",
		en: "LAV WASTE RECEPTACLE ACCESS DOOR COVER",
		group: "lav",
	},
	//廚房 GALLEY
	{
		zh: "廚房水龍頭",
		en: "GALLEY FAUCET",
		group: "galley",
	},
	{
		zh: "廚房水槽",
		en: "GALLEY SINK",
		group: "galley",
	},
	{
		zh: "廚房垃圾桶蓋板",
		en: "GALLEY WASTE RECEPTACLE ACCESS DOOR COVER",
		group: "galley",
	},
	//貨艙 CARGO
	{
		zh: "貨艙防煙簾",
		en: "CARGO ANTI-SMOKE DIVIDER",
		group: "other",
	},
	{
		zh: "貨艙魔鬼氈",
		en: "CARGO VELCRO",
		group: "other",
	},
	//面板 PANEL
	{
		zh: "空服面板",
		en: "FAP",
		group: "panel",
	},
	{
		zh: "客艙管理系統",
		en: "CMS",
		group: "panel",
	},
	{
		zh: "乘客服務面板",
		en: "PSU",
		group: "panel",
	},
	{
		zh: "禁煙指示燈/標示",
		en: "NO SMOKING INDICATOR/PLACARD",
		group: "panel",
	},
	{
		zh: "安全帶指示燈",
		en: "NO SMOKING/SEAT BELT INDICATOR",
		group: "panel",
	},
	{
		zh: "禁用電子用品指示燈",
		en: "NO DEVICE INDICATOR",
		group: "panel",
	},
	{
		zh: "客艙燈號",
		en: "MASTER LIGHT",
		group: "panel",
	},
	{
		zh: "飲用水指示燈",
		en: "POTABLE WATER SYSTEM INDICATION LIGHTS",
		group: "panel",
	},
	{
		zh: "標示牌",
		en: "(指定) PLACARD",
		group: "panel",
		placeholder: true,
	},
	//其他 OTHER
	{
		zh: "加長安全帶",
		en: "EXTENSION SEAT BELT",
		group: "other",
	},
	{
		zh: "壁紙",
		en: "CEILING PAPER DECORATION",
		group: "other",
	},
	{
		zh: "護條",
		en: "BUMPER",
		group: "other",
	},
	{
		zh: "螺絲",
		en: "SCREW",
		group: "other",
	},
	{
		zh: "密封袋/封條",
		en: "SEAL",
		group: "other",
	},
	{
		zh: "安全封籤",
		en: "TAMPER EVIDENT SEAL",
		group: "other",
	},
	{
		zh: "彈簧",
		en: "SPRING",
		group: "other",
	},
	{
		zh: "手動式釋放工具",
		en: "MRT",
		group: "other",
	},
];

export const CLB_STATUSES = [
	{
		zh: "故障(一般)",
		en: "INOP",
	},
	{
		zh: "損壞/破損/斷裂",
		en: "BROKEN",
	},
	{
		zh: "遺失",
		en: "MISSING",
	},
	{
		zh: "剝落",
		en: "PEELED",
	},
	{
		zh: "尖銳",
		en: "SHARP",
	},
	{
		zh: "卡住",
		en: "STUCK",
	},
	{
		zh: "不平衡",
		en: "UNLEVELED",
	},
	{
		zh: "變形",
		en: "DEFORMED",
	},
	{
		zh: "太緊",
		en: "TOO TIGHT",
	},
	{
		zh: "脫線",
		en: "FRAYED",
	},
	{
		zh: "撕裂",
		en: "RIPPED",
	},
	{
		zh: "無黏著力",
		en: "NON-ADHESIVE",
	},
	{
		zh: "堵塞",
		en: "CLOGGED",
	},
	{
		zh: "裂掉/有裂紋",
		en: "CRACKED",
	},
	{
		zh: "未封妥",
		en: "UNSEALED",
	},
	{
		zh: "產生煙",
		en: "EMITS VAPOR/STEAM",
	},
	{
		zh: "產生臭味",
		en: "EMITS FOUL ODOR",
	},
	{
		zh: "難以辨認",
		en: "ILLEGIBLE",
	},
	{
		zh: "產生雜音",
		en: "EMITS STATIC NOISE",
	},
	{
		zh: "過期",
		en: "EXPIRED",
	},
	{
		zh: "故障燈亮",
		en: "FAULT LIGHT ON",
	},
	{
		zh: "產生尖銳聲",
		en: "EMITS HIGH FREQUENCY NOISE",
	},
	{
		zh: "聽不到",
		en: "INAUDIBLE",
	},
	{
		zh: "不完整",
		en: "INCOMPLETE",
	},
	{
		zh: "漏",
		en: "LEAKS",
	},
	{
		zh: "鬆",
		en: "LOOSE",
	},
	{
		zh: "無作用",
		en: "MALFUNCTION/UNSERVICEABLE",
	},
	{
		zh: "不就在定位",
		en: "NOT IN PLACE",
	},
	{
		zh: "壓力指示低於",
		en: "PSI BELOW",
		param: true,
		blank: "(數值)",
	},
	{
		zh: "壓力指示在紅/綠色範圍",
		en: "PRESSURE GAUGE IN RED/GREEN ZONE",
	},
	{
		zh: "短路",
		en: "SHORT CIRCUITED",
	},
	{
		zh: "無法煮",
		en: "UNABLE TO BREW",
	},
	{
		zh: "無法排水",
		en: "UNABLE TO DRAIN",
	},
	{
		zh: "無法沖",
		en: "UNABLE TO FLUSH",
	},
	{
		zh: "無法彈回",
		en: "UNABLE TO RETRACT",
	},
	{
		zh: "無法收妥",
		en: "UNABLE TO STOW",
	},
	{
		zh: "腐蝕",
		en: "CORRODED",
	},
];

export const CLB_TIMES = [
	// { zh: "…期間", en: "DURING", param: true, blank: "(階段)" },
	{
		zh: "滑行",
		en: "DURING TAXI",
	},
		{
		zh: "起飛",
		en: "DURING TAKEOFF",
	},
	{
		zh: "航程中",
		en: "DURING IN-FLIGHT",
	},
	{
		zh: "下降",
		en: "DURING DESCENT",
	},
	{
		zh: "降落",
		en: "DURING LANDING",
	},
	{
		zh: "使用時",
		en: "DURING USE",
	},
	{
		zh: "地點",
		en: "AT (地點)",
		placeholder: true,
	},
];
