import { createClient } from "@supabase/supabase-js";
import "./style.css";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const app = document.querySelector("#app");

if (!url || !key) {
  app.innerHTML = `<main class="wrap"><h1>Fawry Daily Report</h1>
    <p class="warn">لم يتم إعداد بيانات الاتصال بعد.</p>
    <p>انسخ ملف <b>.env.example</b> إلى ملف باسم <b>.env</b>، ثم ضع Project URL وPublishable Key.</p>
    <p>لا تضع أبدًا Secret Key أو service_role في هذا الملف.</p></main>`;
} else {
  const supabase = createClient(url, key);
  let profile = null;

  const shell = (content) => `<header><div class="brand">FAWRY <span>DAILY REPORT</span></div></header><main class="wrap">${content}</main>`;
  const escapeHtml = (v="") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  async function showAuth(message="") {
    app.innerHTML = shell(`<section class="panel narrow"><h1>تسجيل الدخول</h1>${message ? `<p class="info">${escapeHtml(message)}</p>` : ""}
      <form id="login"><label>البريد الإلكتروني<input name="email" type="email" required></label>
      <label>كلمة المرور<input name="password" type="password" required></label>
      <button>دخول</button></form>
      <hr><h2>إنشاء حساب موظف</h2><form id="signup">
      <label>الاسم<input name="name" required></label><label>HR ID<input name="hr_id"></label>
      <label>البريد الإلكتروني<input name="email" type="email" required></label>
      <label>كلمة المرور<input name="password" type="password" minlength="8" required></label>
      <button class="secondary">إنشاء حساب</button></form></section>`);
    document.querySelector("#login").onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      const {error} = await supabase.auth.signInWithPassword({email:f.get("email"),password:f.get("password")});
      if (error) showAuth(error.message); else load();
    };
    document.querySelector("#signup").onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      const {error} = await supabase.auth.signUp({email:f.get("email"),password:f.get("password"),
        options:{data:{full_name:f.get("name"),hr_id:f.get("hr_id")}}});
      showAuth(error ? error.message : "تم إرسال طلب إنشاء الحساب. لو تأكيد البريد مفعّل، افتح رسالة التأكيد أولاً.");
    };
  }

  async function load() {
    const {data:{user}} = await supabase.auth.getUser();
    if (!user) return showAuth();
    const {data:p,error:pe} = await supabase.from("profiles").select("*").eq("id",user.id).maybeSingle();
    if (pe || !p) return showAuth("تعذر تحميل ملف المستخدم: " + (pe?.message || "لم يتم إنشاء profile"));
    profile = p; renderDashboard();
  }

  async function renderDashboard() {
    const isManager = ["manager","super_admin"].includes(profile.role);
    app.innerHTML = shell(`<div class="top"><div><h1>التقارير اليومية</h1><p>مرحباً ${escapeHtml(profile.full_name || "بك")} — ${escapeHtml(profile.role)}</p></div><button id="logout" class="secondary small">خروج</button></div>
      <section class="panel"><h2>إضافة تقرير</h2><form id="report" class="grid">
      <label>اسم الموظف<input name="employee_name" value="${escapeHtml(profile.full_name || "")}" required></label>
      <label>HR ID<input name="hr_id" value="${escapeHtml(profile.hr_id || "")}"></label>
      <label>اسم التاجر<input name="merchant_name" required></label>
      <label>تليفون العميل<input name="customer_phone"></label>
      <label>المنطقة<input name="area"></label><label>POS Account<input name="pos_account" required></label>
      <label>POS Serial<input name="pos_serial"></label>
      <label>الخدمة<select name="service_type" id="service"><option>تركيبة</option><option>ريبليس</option><option>سحب</option><option>قطع غيار</option><option>صيانة</option><option>تيست</option><option>تدريب</option></select></label>
      <label id="awareWrap" class="hidden">Customer aware?<select name="customer_aware"><option value="true">Yes</option><option value="false">No</option></select></label>
      <label id="partWrap" class="hidden">نوع قطعة الغيار<select name="spare_part"><option>شاحن كامل</option><option>وصلة شاحن</option><option>بطارية</option><option>شريحة</option><option>باب برنتر</option><option>باب برنتر كامل</option><option>رول برنتر</option></select></label>
      <label class="wide">صورة التعهد<input name="attachment" type="file" accept="image/*"></label>
      <button class="wide">حفظ التقرير</button></form><p id="formMsg"></p></section>
      <section class="panel"><div class="top"><h2>التقارير</h2><input id="search" placeholder="بحث برقم POS Account"></div>
      <div class="tablewrap"><table><thead><tr><th>التاريخ</th><th>الموظف</th><th>التاجر</th><th>POS Account</th><th>الخدمة</th>${isManager?"<th>إجراء</th>":""}</tr></thead><tbody id="rows"></tbody></table></div></section>`);
    document.querySelector("#logout").onclick = async () => {await supabase.auth.signOut(); showAuth();};
    const service = document.querySelector("#service");
    const toggle = () => {
      document.querySelector("#awareWrap").classList.toggle("hidden",service.value!=="تدريب");
      document.querySelector("#partWrap").classList.toggle("hidden",service.value!=="قطع غيار");
    };
    service.onchange=toggle; toggle();
    document.querySelector("#report").onsubmit = saveReport;
    document.querySelector("#search").oninput = e => loadReports(e.target.value);
    loadReports();
  }

  async function saveReport(e) {
    e.preventDefault();
    const form=e.currentTarget, f=new FormData(form), msg=document.querySelector("#formMsg");
    msg.textContent="جارٍ الحفظ...";
    let attachment_path=null;
    const file=f.get("attachment");
    if (file && file.size) {
      const path=`${(await supabase.auth.getUser()).data.user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
      const {error}=await supabase.storage.from("pledge-attachments").upload(path,file,{upsert:false});
      if(error){msg.textContent="فشل رفع المرفق: "+error.message;return;}
      attachment_path=path;
    }
    const payload={
      employee_name:f.get("employee_name"),hr_id:f.get("hr_id"),merchant_name:f.get("merchant_name"),
      customer_phone:f.get("customer_phone"),area:f.get("area"),pos_account:f.get("pos_account"),
      pos_serial:f.get("pos_serial"),service_type:f.get("service_type"),
      customer_aware:f.get("service_type")==="تدريب" ? f.get("customer_aware")==="true" : null,
      spare_part:f.get("service_type")==="قطع غيار" ? f.get("spare_part") : null,
      attachment_path,submitted_by:(await supabase.auth.getUser()).data.user.id
    };
    const {error}=await supabase.from("reports").insert(payload);
    msg.textContent=error ? "تعذر حفظ التقرير: "+error.message : "تم حفظ التقرير بنجاح";
    if(!error){form.reset();loadReports();document.querySelector("#awareWrap").classList.add("hidden");document.querySelector("#partWrap").classList.add("hidden");}
  }

  async function loadReports(search="") {
    let q=supabase.from("reports").select("*").order("report_date",{ascending:false}).limit(200);
    if(search.trim()) q=q.ilike("pos_account",`%${search.trim()}%`);
    const {data,error}=await q, tbody=document.querySelector("#rows");
    if(!tbody)return;
    if(error){tbody.innerHTML=`<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`;return;}
    const isManager=["manager","super_admin"].includes(profile.role);
    tbody.innerHTML=(data||[]).map(r=>`<tr><td>${new Date(r.report_date).toLocaleString("ar-EG")}</td><td>${escapeHtml(r.employee_name)}</td><td>${escapeHtml(r.merchant_name)}</td><td>${escapeHtml(r.pos_account)}</td><td>${escapeHtml(r.service_type)}</td>${isManager?`<td><button class="danger mini" data-delete="${r.id}">حذف</button></td>`:""}</tr>`).join("") || `<tr><td colspan="6">لا توجد تقارير</td></tr>`;
    tbody.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{
      if(!confirm("تأكيد حذف التقرير؟"))return;
      const {error}=await supabase.from("reports").delete().eq("id",b.dataset.delete);
      if(error)alert(error.message);else loadReports(search);
    });
  }

  supabase.auth.onAuthStateChange((_event,session)=>{if(!session) showAuth();});
  load();
}
if ("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));