// ===== 第一關：水費計算器 =====
const RATES = [
  { limit: 20, price: 7.35 },
  { limit: 40, price: 9.45 },
  { limit: 40, price: 11.55 },
  { limit: Infinity, price: 12.075 }
];

function calculate() {
  const usage = parseFloat(document.getElementById("usage").value);
  if (isNaN(usage) || usage < 0) {
    alert("請輸入正確的用水度數");
    return;
  }
  let remaining = usage;
  let total = 0;
  RATES.forEach((tier, i) => {
    const used = Math.min(Math.max(remaining, 0), tier.limit);
    const fee = used * tier.price;
    document.getElementById("tier" + (i + 1)).textContent = fee.toFixed(2) + " 元";
    total += fee;
    remaining -= used;
  });
  document.getElementById("total").textContent = total.toFixed(2) + " 元";
}

// ===== 第二關：切換頁面 =====
function showPage(name) {
  // 1. 先把所有頁面的 active 拿掉
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  // 2. 再把被點的那一頁加上 active
  document.getElementById("page-" + name).classList.add("active");
  // 3. 導覽列的高亮也一樣處理
  document.querySelectorAll(".nav-link").forEach(a => a.classList.remove("active"));
  document.getElementById("nav-" + name).classList.add("active");
}
