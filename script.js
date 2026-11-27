/* =========================================================
   記帳小幫手
   一句話：資料放在「抽屜」(localStorage)，畫面每次都從抽屜重新畫。
   所以：新增 / 刪除 → 改抽屜 → render() 重畫畫面。
   ========================================================= */

/* ---------- 1. 設定（想改分類，改這裡）---------- */
const CATEGORIES = [
  { name: "餐飲", icon: "🍜", color: "#f97316" },
  { name: "交通", icon: "🚌", color: "#3b82f6" },
  { name: "娛樂", icon: "🎮", color: "#a855f7" },
  { name: "學習", icon: "📚", color: "#10b981" },
  { name: "購物", icon: "🛍️", color: "#ec4899" },
  { name: "其他", icon: "📦", color: "#64748b" },
];
const KEY = "accountBook";          // 抽屜的名字

/* ---------- 2. 抽屜：讀、存 ---------- */
function loadRecords() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];                       // 抽屜裡的字壞掉了，就當作空的
  }
}

function saveRecords(records) {
  localStorage.setItem(KEY, JSON.stringify(records));
}

/* ---------- 3. 小工具 ---------- */
function pad2(n) { return String(n).padStart(2, "0"); }

function todayText() {               // 例如 "2026-11-27"（用本地時間）
  const d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function daysInMonth(ym) {           // "2026-11" → 30
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function money(n) { return "$" + Math.round(n).toLocaleString("en-US"); }

function findCategory(name) {        // 找不到就用最後一個（其他）
  return CATEGORIES.find(c => c.name === name) || CATEGORIES[CATEGORIES.length - 1];
}

function el(tag, className, text) {  // 建立一個元素
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;   // 用 textContent，備註才不會被當成程式
  return node;
}

/* ---------- 4. 目前的狀態 ---------- */
let currentMonth = todayText().slice(0, 7);          // 正在看哪個月，例如 "2026-11"
let selectedCategory = CATEGORIES[0].name;           // 表單選的分類

/* ---------- 5. 抓畫面上的元素 ---------- */
const $ = id => document.getElementById(id);
const form = $("addForm");
const amountInput = $("amount");
const dateInput = $("date");
const noteInput = $("note");

/* ---------- 6. 畫畫面（全部都從資料算出來）---------- */
function render() {
  const all = loadRecords();
  const records = all.filter(r => String(r.date).startsWith(currentMonth));   // 只留這個月

  renderMonthBar();
  renderTotal(records);
  renderPie(records);
  renderBars(records);
  renderList(records, all.length);
}

function renderMonthBar() {
  const [y, m] = currentMonth.split("-");
  $("monthTitle").textContent = y + " 年 " + Number(m) + " 月";
  $("nextMonth").disabled = currentMonth >= todayText().slice(0, 7);   // 不能看未來
}

function renderTotal(records) {
  const total = records.reduce((sum, r) => sum + r.amount, 0);
  const isThisMonth = currentMonth === todayText().slice(0, 7);
  const days = isThisMonth ? Number(todayText().slice(8)) : daysInMonth(currentMonth);

  $("totalText").textContent = money(total);
  $("subText").textContent = records.length === 0
    ? "這個月還沒有紀錄"
    : "共 " + records.length + " 筆・平均每天 " + money(total / days);
}

/* 圖表 1：環圈圖。算出每一類的占比，再組成 conic-gradient */
function renderPie(records) {
  const pie = $("pie");
  const legend = $("legend");
  legend.innerHTML = "";

  // 每一類加起來
  const sums = {};
  records.forEach(r => { sums[r.category] = (sums[r.category] || 0) + r.amount; });
  const rows = Object.entries(sums).sort((a, b) => b[1] - a[1]);    // 花最多的排前面
  const total = rows.reduce((s, row) => s + row[1], 0);

  if (rows.length === 0) {
    pie.style.background = "";                                       // 回到灰色
    $("pieCenter").textContent = "";
    legend.appendChild(el("li", "empty", "記一筆就會出現圖表"));
    return;
  }

  let start = 0;
  const stops = [];
  rows.forEach(([name, sum]) => {
    const cat = findCategory(name);
    const end = start + (sum / total) * 100;
    stops.push(cat.color + " " + start + "% " + end + "%");          // 例如 #f97316 0% 45%
    start = end;

    const li = el("li");
    const dot = el("span", "dot");
    dot.style.background = cat.color;
    li.append(dot, el("span", "name", cat.icon + " " + name),
              el("span", "pct", Math.round((sum / total) * 100) + "%"),
              el("span", "money", money(sum)));
    legend.appendChild(li);
  });
  pie.style.background = "conic-gradient(" + stops.join(", ") + ")";

  const top = findCategory(rows[0][0]);
  const center = $("pieCenter");
  center.innerHTML = "";
  center.append("最多", el("b", "", top.icon + " " + top.name));
}

/* 圖表 2：長條圖。每一天算出總和，柱子高度 = 這天 ÷ 最高的那天 */
function renderBars(records) {
  const box = $("bars");
  box.innerHTML = "";
  const n = daysInMonth(currentMonth);

  const perDay = new Array(n + 1).fill(0);                           // perDay[5] = 5 號花的錢
  records.forEach(r => { perDay[Number(String(r.date).slice(8, 10))] += r.amount; });

  const max = Math.max(...perDay);
  const topDay = max > 0 ? perDay.indexOf(max) : 0;
  const todayDay = currentMonth === todayText().slice(0, 7) ? Number(todayText().slice(8)) : 0;

  for (let d = 1; d <= n; d++) {
    const col = el("div", "bar-col" + (d === todayDay ? " today" : "") + (d === topDay ? " top" : ""));
    const area = el("div", "bar-area");
    const bar = el("div", "bar");
    bar.style.height = max > 0 ? (perDay[d] / max) * 100 + "%" : "0%";
    area.appendChild(bar);
    const showLabel = d === 1 || d % 5 === 0 || d === todayDay;      // 標 1、5、10、15…和今天
    col.append(area, el("div", "bar-label", showLabel ? d : ""));
    box.appendChild(col);
  }

  const [, m] = currentMonth.split("-");
  $("barNote").textContent = max > 0
    ? "花最多的一天：" + Number(m) + "/" + topDay + "，花了 " + money(max)
    : "";
}

/* 明細列表 */
function renderList(records, allCount) {
  const list = $("list");
  list.innerHTML = "";

  const sorted = records.slice().sort((a, b) =>
    String(b.date).localeCompare(String(a.date)) || b.id - a.id);    // 新的在上面

  if (sorted.length === 0) {
    list.appendChild(el("li", "empty", "還沒有紀錄"));
  }

  sorted.forEach(r => {
    const cat = findCategory(r.category);
    const li = el("li");
    li.style.setProperty("--chip-color", cat.color);

    const info = el("div", "info");
    info.append(el("div", "title", r.note || r.category),
                el("div", "date", String(r.date).slice(5).replace("-", "/") + "・" + r.category));

    const del = el("button", "del", "✕");
    del.type = "button";
    del.setAttribute("aria-label", "刪除這一筆");
    del.addEventListener("click", () => deleteRecord(r.id));

    li.append(el("div", "icon", cat.icon), info, el("div", "money", money(r.amount)), del);
    list.appendChild(li);
  });

  $("sampleBtn").hidden = allCount > 0;                              // 抽屜完全空的才顯示
}

/* ---------- 7. 改抽屜 ---------- */
function addRecord(amount, category, date, note) {
  const records = loadRecords();
  records.push({ id: Date.now(), amount: amount, category: category, date: date, note: note });
  saveRecords(records);
}

function deleteRecord(id) {
  if (!confirm("要刪除這一筆嗎？")) return;
  saveRecords(loadRecords().filter(r => r.id !== id));
  render();
}

function addSampleData() {
  const lastDay = currentMonth === todayText().slice(0, 7)
    ? Number(todayText().slice(8)) : daysInMonth(currentMonth);
  // [幾號, 分類, 金額, 備註]
  const demo = [
    [1, "餐飲", 85, "早餐"], [1, "交通", 30, "公車"], [2, "餐飲", 120, "午餐"],
    [3, "學習", 280, "參考書"], [4, "娛樂", 150, "電影"], [5, "餐飲", 95, "晚餐"],
    [7, "購物", 399, "筆袋"], [8, "餐飲", 70, "飲料"], [9, "交通", 60, "車票"],
    [11, "餐飲", 130, "同學聚餐"], [12, "娛樂", 99, "遊戲點數"], [14, "餐飲", 80, "午餐"],
    [15, "學習", 120, "文具"], [17, "餐飲", 110, "宵夜"], [20, "交通", 45, "公車"],
  ];
  const records = loadRecords();
  demo.forEach(([day, category, amount, note], i) => {
    const d = Math.min(day, lastDay);
    records.push({ id: Date.now() + i, amount: amount, category: category,
                   date: currentMonth + "-" + pad2(d), note: note });
  });
  saveRecords(records);
  render();
}

/* ---------- 8. 按鈕要做什麼 ---------- */
function changeMonth(step) {
  let [y, m] = currentMonth.split("-").map(Number);
  m += step;
  if (m === 0) { m = 12; y -= 1; }
  if (m === 13) { m = 1; y += 1; }
  currentMonth = y + "-" + pad2(m);
  render();
}

$("prevMonth").addEventListener("click", () => changeMonth(-1));
$("nextMonth").addEventListener("click", () => changeMonth(1));
$("sampleBtn").addEventListener("click", addSampleData);

form.addEventListener("submit", event => {
  event.preventDefault();                                            // 不要重新整理頁面
  const amount = Math.round(Number(amountInput.value));
  if (!(amount > 0)) return;

  const date = dateInput.value || todayText();
  addRecord(amount, selectedCategory, date, noteInput.value.trim());

  currentMonth = date.slice(0, 7);                                   // 跳到那筆所在的月份
  amountInput.value = "";
  noteInput.value = "";
  render();
  amountInput.focus();
});

/* ---------- 9. 開始：做出分類按鈕，畫第一次 ---------- */
function buildChips() {
  const box = $("categoryChips");
  CATEGORIES.forEach((cat, i) => {
    const input = el("input");
    input.type = "radio";
    input.name = "category";
    input.id = "cat" + i;
    input.checked = i === 0;
    input.addEventListener("change", () => { selectedCategory = cat.name; });

    const label = el("label", "", cat.icon + " " + cat.name);
    label.htmlFor = input.id;
    label.style.setProperty("--chip-color", cat.color);
    box.append(input, label);
  });
}

dateInput.value = todayText();
buildChips();
render();
