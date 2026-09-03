"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { BookCheck, BookOpenCheck, CalendarCheck, Camera, Check, ChevronRight, ClipboardCheck, Cloud, CloudOff, GraduationCap, Home, LockKeyhole, LogOut, Mail, Nfc, Plus, Search, Trash2, UserRound, Users, WifiOff, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Tab = "dashboard" | "kehadiran" | "tugasan" | "hafazan" | "pbd" | "profil";
type Student = {
  id: string; nama: string; tingkatan: string; fotoUrl: string; tarikhDaftar: string;
  attendance: Record<number, string>;
  tasks: Record<string, { statusHantar: boolean; tarikhHantar?: string; catatan?: string }>;
  hafazan: { surahNama: string; ayatMula: number; ayatAkhir: number; tahap: string; tarikhTasmi?: string }[];
  pbd: Record<string, number>; ujian: Record<string, number>;
};
type Task = { id: string; tajuk: string; tarikh: string; tingkatan?: string };

type HafazanTarget = { surah: string; ayat: number };
const TARGETS: Record<string, HafazanTarget[]> = {
  "Tingkatan 1": [{ surah: "Al-Sajdah", ayat: 30 }, { surah: "Al-Insan", ayat: 31 }, { surah: "Al-A'la", ayat: 19 }, { surah: "Al-Ghasiyah", ayat: 26 }],
  "Tingkatan 2": [{ surah: "Al-Waqiah", ayat: 96 }, { surah: "Nuh", ayat: 28 }],
  "Tingkatan 3": [{ surah: "Al-Saff", ayat: 14 }, { surah: "Al-Jumuah", ayat: 11 }],
  "Tingkatan 4": [{ surah: "Yasin", ayat: 83 }, { surah: "Al-Munafiqun", ayat: 11 }],
  "Tingkatan 5": [{ surah: "Al-Mulk", ayat: 30 }],
};
const PBD_SKILLS = ["Tajwid", "Hafazan", "Qiraat", "Tarannum"] as const;
const normalizeStudent = (student: Student): Student => {
  const oldTilawah = student.pbd.Tilawah;
  return { ...student, hafazan: student.hafazan.map(h => ({ ...h, surahNama: h.surahNama === "As-Sajdah" ? "Al-Sajdah" : h.surahNama })), pbd: { Tajwid: student.pbd.Tajwid ?? 1, Hafazan: student.pbd.Hafazan ?? 1, Qiraat: student.pbd.Qiraat ?? oldTilawah ?? 1, Tarannum: student.pbd.Tarannum ?? 1 } };
};
const targetProgress = (student: Student, target: HafazanTarget) => Math.min(student.hafazan.find(h => h.surahNama === target.surah)?.ayatAkhir || 0, target.ayat);
const overallHafazan = (student: Student) => { const targets = TARGETS[student.tingkatan] || []; const total = targets.reduce((n,t)=>n+t.ayat,0); const done = targets.reduce((n,t)=>n+targetProgress(student,t),0); return { targets, total, done, progress: total ? Math.round(done/total*100) : 0 }; };
const activeHafazanTarget = (student: Student) => (TARGETS[student.tingkatan] || []).find(target => targetProgress(student, target) < target.ayat);
const initialStudents: Student[] = [];
const initialTasks: Task[] = [
  { id: "t1", tajuk: "Latihan Tajwid 1", tarikh: "2026-02-05", tingkatan: "Tingkatan 1" }, { id: "t2", tajuk: "Tugasan Kaligrafi", tarikh: "2026-03-19", tingkatan: "Tingkatan 2" }, { id: "t3", tajuk: "Latihan Hukum Mad", tarikh: "2026-04-16", tingkatan: "Tingkatan 3" },
];
const initialSessions = ["2026-01-15", "2026-02-05", "2026-02-26", "2026-03-19", "2026-04-16", "2026-05-14", "2026-06-18", "2026-07-16", "2026-08-13", "2026-09-17", "2026-10-15", "2026-11-12"];
const nav = [
  { id: "dashboard", label: "Utama", icon: Home }, { id: "kehadiran", label: "Hadir", icon: CalendarCheck },
  { id: "tugasan", label: "Tugasan", icon: BookOpenCheck }, { id: "hafazan", label: "Hafazan", icon: BookCheck },
  { id: "pbd", label: "PBD", icon: GraduationCap }, { id: "profil", label: "Profil", icon: UserRound },
] as const;
const today = () => new Date().toISOString().slice(0, 10);
const initials = (name: string) => name.split(" ").slice(0, 2).map(x => x[0]).join("");
const fmtDate = (date: string) => new Intl.DateTimeFormat("ms-MY", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date));
const filterStudentRecords = (students: Student[], form: string, search: string) => students.filter(student => student.tingkatan === form && (student.nama.toLowerCase().includes(search.toLowerCase()) || student.id.toLowerCase().includes(search.toLowerCase())));

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [sessions, setSessions] = useState(initialSessions);
  const [selectedId, setSelectedId] = useState("");
  const [sessionNo, setSessionNo] = useState(6);
  const [taskId, setTaskId] = useState("t3");
  const [sheet, setSheet] = useState<"scan" | "student" | "new" | "addTask" | "hafazan" | "registerNfc" | null>(null);
  const [pendingUid, setPendingUid] = useState("04:NEW:01");
  const [newName, setNewName] = useState("");
  const [newForm, setNewForm] = useState("Tingkatan 1");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskForm, setNewTaskForm] = useState("");
  const [profileForm, setProfileForm] = useState("");
  const [hafazanSurah, setHafazanSurah] = useState("");
  const [hafazanAyat, setHafazanAyat] = useState("");
  const [nfcUidInput, setNfcUidInput] = useState("");
  const [scanState, setScanState] = useState<"idle" | "scanning" | "unsupported">("idle");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(!isSupabaseConfigured);
  const [backendLoaded, setBackendLoaded] = useState(!isSupabaseConfigured);
  const [syncState, setSyncState] = useState<"local" | "saving" | "synced" | "offline">(isSupabaseConfigured ? "saving" : "local");

  useEffect(() => {
    const saved = localStorage.getItem("kkq-pwa-data-v1");
    if (saved) try { const x = JSON.parse(saved); setStudents((x.students as Student[]).map(normalizeStudent)); setTasks(x.tasks); setSessions(x.sessions); } catch {}
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setAuthSession(data.session); setAuthChecked(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { setAuthSession(session); setAuthChecked(true); if (!session) setBackendLoaded(false); });
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const client = supabase;
    if (!client || !authSession) return;
    let active = true;
    setSyncState("saving");
    client.rpc("get_kkq_state").then(async ({ data, error }) => {
      if (!active) return;
      if (error) { setSyncState("offline"); setBackendLoaded(true); return; }
      const state = data as { students: Student[]; tasks: Task[]; sessions: string[] } | null;
      if (state?.sessions?.length === 12) {
        setStudents((state.students || []).map(normalizeStudent));
        setTasks(state.tasks || []);
        setSessions(state.sessions);
      } else {
        const result = await client.rpc("replace_kkq_state", { p_students: students, p_tasks: tasks, p_sessions: sessions });
        if (result.error) { setSyncState("offline"); setBackendLoaded(true); return; }
      }
      setBackendLoaded(true);
      setSyncState("synced");
    });
    return () => { active = false; };
  }, [authSession?.user.id]);
  useEffect(() => {
    const snapshot = { students, tasks, sessions };
    localStorage.setItem("kkq-pwa-data-v1", JSON.stringify(snapshot));
    const client = supabase;
    if (!client || !authSession || !backendLoaded) return;
    setSyncState("saving");
    const timer = window.setTimeout(async () => {
      const { error } = await client.rpc("replace_kkq_state", {
        p_students: snapshot.students,
        p_tasks: snapshot.tasks,
        p_sessions: snapshot.sessions,
      });
      setSyncState(error ? "offline" : "synced");
    }, 450);
    return () => window.clearTimeout(timer);
  }, [students, tasks, sessions, authSession?.user.id, backendLoaded]);
  const student = students.find(s => s.id === selectedId) || students[0];
  const nextHafazan = student ? activeHafazanTarget(student) : undefined;
  const filtered = students.filter(s => s.tingkatan === profileForm && (s.nama.toLowerCase().includes(search.toLowerCase()) || s.id.toLowerCase().includes(search.toLowerCase())));
  function notify(msg: string) { setToast(msg); window.setTimeout(() => setToast(""), 2500); }
  function selectStudent(id: string) { setSelectedId(id); setSheet("student"); setScanState("idle"); }
  function simulateScan(id?: string) { const picked = id || students[Math.floor(Math.random() * students.length)]?.id; if (!picked) { notify("Belum ada murid untuk simulasi"); return; } selectStudent(picked); notify("Identiti murid berjaya disahkan"); }
  async function startNfc() {
    setScanState("scanning");
    const NDEF = (window as unknown as { NDEFReader?: new () => { scan(): Promise<void>; onreading: ((e: { serialNumber?: string }) => void) | null } }).NDEFReader;
    if (!NDEF) { setTimeout(() => setScanState("unsupported"), 650); return; }
    try { const reader = new NDEF(); await reader.scan(); reader.onreading = e => { const uid = (e.serialNumber || "").toUpperCase(); const found = students.find(s => s.id.replaceAll(":", "") === uid.replaceAll(":", "")); if (found) selectStudent(found.id); else { setPendingUid(uid); setSheet("new"); } }; }
    catch { setScanState("unsupported"); }
  }
  function openNfcRegistration() { setNfcUidInput(""); setScanState("idle"); setSheet("registerNfc"); }
  function assignNfcUid(rawUid: string) {
    const uid = rawUid.trim().replaceAll(" ", "").toUpperCase();
    const canonical = uid.replace(/[\s:-]/g, "");
    if (canonical.length < 8) { notify("UID kad NFC tidak lengkap"); return; }
    const duplicate = students.find(s => s.id !== student.id && s.id.replace(/[\s:-]/g, "").toUpperCase() === canonical);
    if (duplicate) { notify(`Kad ini sudah didaftarkan kepada ${duplicate.nama}`); setScanState("idle"); return; }
    const previousId = student.id;
    if (previousId.replace(/[\s:-]/g, "").toUpperCase() === canonical) { notify("Kad NFC ini sudah didaftarkan kepada murid ini"); setScanState("idle"); setSheet("student"); return; }
    setStudents(xs => xs.map(s => s.id === previousId ? { ...s, id: uid } : s));
    setSelectedId(uid);
    setNfcUidInput(uid);
    setScanState("idle");
    setSheet("student");
    notify("Kad NFC berjaya didaftarkan kepada profil murid");
  }
  async function startNfcRegistration() {
    setScanState("scanning");
    const NDEF = (window as unknown as { NDEFReader?: new () => { scan(): Promise<void>; onreading: ((e: { serialNumber?: string }) => void) | null } }).NDEFReader;
    if (!NDEF) { setTimeout(() => setScanState("unsupported"), 650); return; }
    try { const reader = new NDEF(); await reader.scan(); reader.onreading = e => assignNfcUid(e.serialNumber || ""); }
    catch { setScanState("unsupported"); }
  }
  function markAttendance() { setStudents(xs => xs.map(s => s.id === student.id ? { ...s, attendance: { ...s.attendance, [sessionNo]: new Date().toISOString() } } : s)); notify(`${student.nama} ditanda hadir`); setSheet(null); }
  function markTask() { setStudents(xs => xs.map(s => s.id === student.id ? { ...s, tasks: { ...s.tasks, [taskId]: { statusHantar: true, tarikhHantar: today() } } } : s)); notify("Penyerahan tugasan direkodkan"); setSheet(null); }
  function openHafazanEditor() { const target = activeHafazanTarget(student) || TARGETS[student.tingkatan]?.[0]; if (!target) return; setHafazanSurah(target.surah); setHafazanAyat(String(targetProgress(student, target))); setSheet("hafazan"); }
  function saveHafazan() { const target = (TARGETS[student.tingkatan] || []).find(x => x.surah === hafazanSurah); const end = Number(hafazanAyat); if (!target || !Number.isInteger(end) || end < 0 || end > target.ayat) { notify(`Masukkan ayat antara 0 hingga ${target?.ayat || 0}`); return; } const old = student.hafazan.find(h => h.surahNama === target.surah); const record = { surahNama: target.surah, ayatMula: old?.ayatMula || 1, ayatAkhir: end, tahap: end === target.ayat ? "Lancar" : old?.tahap || "Lancar", tarikhTasmi: today() }; setStudents(xs => xs.map(s => s.id === student.id ? { ...s, hafazan: [...s.hafazan.filter(h => h.surahNama !== target.surah), record] } : s)); notify(`${target.surah} direkod hingga ayat ${end}`); setSheet(null); }
  function registerStudent() { if (!newName.trim()) return; const fresh: Student = { id: pendingUid, nama: newName.trim(), tingkatan: newForm, fotoUrl: "", tarikhDaftar: today(), attendance: {}, tasks: {}, hafazan: [], pbd: { Tajwid: 1, Hafazan: 1, Qiraat: 1, Tarannum: 1 }, ujian: { "Ujian 1": 0, UASA: 0 } }; setStudents(xs => [...xs, fresh]); setSelectedId(fresh.id); setNewName(""); setSheet("student"); notify("Murid baharu berjaya didaftarkan"); }
  function openAddTask(form = "") { setNewTaskTitle(""); setNewTaskForm(form); setSheet("addTask"); }
  function saveNewTask() { const title = newTaskTitle.trim(); if (!title || !newTaskForm) return; const task: Task = { id: `t${Date.now()}`, tajuk: title, tarikh: today(), tingkatan: newTaskForm }; setTasks(xs => [...xs, task]); setTaskId(task.id); setNewTaskTitle(""); setNewTaskForm(""); setSheet(null); notify(`Tugasan ${newTaskForm} berjaya ditambah`); }
  function updatePbd() { const raw = prompt("Masukkan TP Hafazan (1–6)", String(student.pbd.Hafazan || 1)); const tp = Number(raw); if (tp >= 1 && tp <= 6) { setStudents(xs => xs.map(s => s.id === student.id ? { ...s, pbd: { ...s.pbd, Hafazan: tp } } : s)); notify(`PBD Hafazan dikemas kini kepada TP${tp}`); } }
  function updateExam() { const raw = prompt("Masukkan markah UASA (0–100)", String(student.ujian.UASA || 0)); const mark = Number(raw); if (mark >= 0 && mark <= 100) { setStudents(xs => xs.map(s => s.id === student.id ? { ...s, ujian: { ...s.ujian, UASA: mark } } : s)); notify("Markah UASA dikemas kini"); } }
  function updateStudentPbd(id: string, kemahiran: string, tp: number) { if (tp < 1 || tp > 6) return; setStudents(xs => xs.map(s => s.id === id ? { ...s, pbd: { ...s.pbd, [kemahiran]: tp } } : s)); notify(`${kemahiran} dikemas kini kepada TP${tp}`); }
  function updateStudentExam(id: string, ujian: string, markah: number) { if (markah < 0 || markah > 100) return; setStudents(xs => xs.map(s => s.id === id ? { ...s, ujian: { ...s.ujian, [ujian]: markah } } : s)); }
  function updatePhoto(file?: File) { if (!file || !file.type.startsWith("image/")) return; const reader = new FileReader(); reader.onload = () => { const img = new Image(); img.onload = () => { const canvas = document.createElement("canvas"), size = 360; canvas.width = size; canvas.height = size; const ctx = canvas.getContext("2d"); if (!ctx) return; const crop = Math.min(img.width, img.height), sx = (img.width - crop) / 2, sy = (img.height - crop) / 2; ctx.drawImage(img, sx, sy, crop, crop, 0, 0, size, size); const fotoUrl = canvas.toDataURL("image/jpeg", .82); setStudents(xs => xs.map(s => s.id === student.id ? { ...s, fotoUrl } : s)); notify("Foto murid berjaya dikemas kini"); }; img.src = String(reader.result); }; reader.readAsDataURL(file); }

  if (!authChecked || (authSession && !backendLoaded)) return <LoadingScreen/>;
  if (isSupabaseConfigured && !authSession) return <TeacherLogin/>;

  return <main className="min-h-dvh bg-[#f4f6f3] pb-24 text-slate-900">
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/82 px-4 py-2.5 backdrop-blur-2xl"><div className="mx-auto flex max-w-5xl items-center">
      <div className="flex min-w-0 items-center gap-2.5"><img src="/icons/icon-192.png" alt="" className="size-9 shrink-0 rounded-xl object-cover shadow-sm"/><div className="min-w-0 leading-tight"><h1 className="truncate text-[15px] font-bold tracking-tight">Smart KKQ</h1><p className="flex items-center gap-1 truncate text-[11px] font-medium text-slate-500">{syncState === "offline" ? <CloudOff size={11}/> : <Cloud size={11}/>} {syncState === "saving" ? "Menyegerak…" : syncState === "synced" ? "Disimpan di Supabase" : syncState === "offline" ? "Luar talian" : "Simpanan peranti"}</p></div></div>
      {authSession && <button onClick={() => supabase?.auth.signOut()} aria-label="Log keluar" className="ml-auto grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-500 active:bg-slate-200"><LogOut size={16}/></button>}
    </div></header>
    <div className="mx-auto max-w-5xl px-4 py-5">
      {tab === "dashboard" && <Dashboard students={students} sessions={sessions} tasks={tasks}/>} 
      {tab === "kehadiran" && <AttendanceView students={students} setStudents={setStudents} sessions={sessions} sessionNo={sessionNo} setSessionNo={setSessionNo} setSessions={setSessions} onStudent={selectStudent} notify={notify}/>} 
      {tab === "tugasan" && <TasksView students={students} setStudents={setStudents} tasks={tasks} taskId={taskId} setTaskId={setTaskId} setTasks={setTasks} onAddTask={openAddTask} notify={notify}/>}
      {tab === "hafazan" && <HafazanView students={students} onStudent={selectStudent}/>} 
      {tab === "pbd" && <PbdMarkahView students={students} onPbdChange={updateStudentPbd} onExamChange={updateStudentExam}/>} 
      {tab === "profil" && <ProfileView students={filtered} search={search} setSearch={setSearch} profileForm={profileForm} setProfileForm={setProfileForm} onStudent={selectStudent}/>} 
    </div>
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 bg-white/90 px-1 pb-[max(.35rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-2xl"><div className="mx-auto grid max-w-xl grid-cols-7">{nav.slice(0,3).map(item => <NavItem key={item.id} item={item} tab={tab} setTab={setTab}/>)}<button onClick={() => setSheet("scan")} aria-label="Imbas kad NFC" className="flex min-h-[3.35rem] flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-semibold text-emerald-800 active:bg-emerald-50"><span className={`relative isolate grid size-7 place-items-center rounded-full text-white transition-colors ${scanState === "scanning" ? "nfc-scanning bg-[#d7ed73] text-[#163c35]" : "bg-[#163c35]"}`}><Nfc size={16} strokeWidth={2.4}/></span><span>{scanState === "scanning" ? "Mengimbas" : "NFC"}</span></button>{nav.slice(3).map(item => <NavItem key={item.id} item={item} tab={tab} setTab={setTab}/>)}</div></nav>

    <Sheet open={sheet === "scan"} onOpenChange={o => !o && setSheet(null)}><SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-[2rem] border-0 px-5 pb-8"><div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-200"/><SheetHeader className="px-0 text-left"><SheetTitle className="text-xl">Imbas Kad NFC</SheetTitle><SheetDescription>Sentuhkan kad murid pada bahagian belakang telefon.</SheetDescription></SheetHeader><div className="grid place-items-center py-5"><div className={`relative grid size-32 place-items-center rounded-full bg-emerald-50 ${scanState === "scanning" ? "scan-radar" : ""}`}><span className={`size-5 rounded-full bg-emerald-700 ${scanState === "scanning" ? "animate-pulse" : "shadow-[0_0_0_16px_rgba(16,185,129,.12),0_0_0_34px_rgba(16,185,129,.07)]"}`}/><span className="absolute inset-2 rounded-full border border-dashed border-emerald-400"/></div><p className="mt-5 text-center text-sm font-semibold text-slate-600">{scanState === "scanning" ? "Mengimbas… dekatkan kad pada telefon" : scanState === "unsupported" ? "Web NFC tidak tersedia pada peranti ini" : "Pengimbas sedia digunakan"}</p></div><button onClick={startNfc} disabled={scanState === "scanning"} className="w-full rounded-2xl bg-[#163c35] py-4 font-bold text-white disabled:bg-emerald-700">{scanState === "scanning" ? "Imbasan sedang aktif…" : "Mulakan Imbasan"}</button><button onClick={() => simulateScan()} className="mt-3 w-full rounded-2xl bg-slate-100 py-3.5 text-sm font-bold text-slate-700">Simulasi Kad Berdaftar</button><button onClick={() => { setPendingUid(`04:BARU:${String(students.length + 1).padStart(2,"0")}`); setSheet("new"); }} className="mt-2 w-full rounded-2xl py-3 text-sm font-bold text-emerald-800">Simulasi Kad Belum Berdaftar</button>{scanState === "unsupported" && <p className="mt-3 flex items-center justify-center gap-2 text-xs text-amber-700"><WifiOff size={14}/>Gunakan Chrome Android melalui HTTPS, atau mod demo.</p>}</SheetContent></Sheet>
    <Sheet open={sheet === "new"} onOpenChange={o => !o && setSheet(null)}><SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-[2rem] border-0 px-5 pb-8"><div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-200"/><SheetHeader className="px-0 text-left"><SheetTitle className="text-xl">Daftar Murid Baharu</SheetTitle><SheetDescription>UID <code className="font-bold text-emerald-700">{pendingUid}</code> belum wujud dalam sistem.</SheetDescription></SheetHeader><div className="space-y-3"><label className="form-label">Nama penuh<input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Contoh: Ahmad Firdaus" className="form-input"/></label><label className="form-label">Tingkatan<select value={newForm} onChange={e=>setNewForm(e.target.value)} className="form-input">{Object.keys(TARGETS).map(x=><option key={x}>{x}</option>)}</select></label><button onClick={registerStudent} className="mt-2 w-full rounded-2xl bg-[#163c35] py-4 font-bold text-white disabled:opacity-40" disabled={!newName.trim()}>Daftar & Buka Profil</button></div></SheetContent></Sheet>
    <Sheet open={sheet === "student"} onOpenChange={o => !o && setSheet(null)}><SheetContent side="bottom" className="mx-auto max-h-[91dvh] max-w-lg overflow-y-auto rounded-t-[2rem] border-0 px-5 pb-8"><StudentCard student={student} tasks={tasks} onPhotoChange={updatePhoto}/><div className="mt-5 grid gap-3"><button onClick={openNfcRegistration} className="action-button border border-emerald-200 bg-emerald-50 text-emerald-950"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#163c35] text-white"><Nfc size={20}/></span><span><b>Daftar Kad NFC</b><small>Imbas kad dan pautkan kepada murid ini</small></span><ChevronRight size={18}/></button><button onClick={markAttendance} className="action-button bg-emerald-800 text-white"><CalendarCheck size={20}/><span><b>Tanda Kehadiran</b><small>Sesi {sessionNo} • {fmtDate(sessions[sessionNo - 1])}</small></span><ChevronRight size={18}/></button><button onClick={markTask} className="action-button bg-sky-50 text-sky-900"><ClipboardCheck size={20}/><span><b>Rekod Tugasan</b><small>{tasks.find(t => t.id === taskId)?.tajuk}</small></span><ChevronRight size={18}/></button><button onClick={openHafazanEditor} className="action-button bg-amber-50 text-amber-900"><BookCheck size={20}/><span><b>Kemas Kini Hafazan</b><small>{nextHafazan ? `Isi ayat hafazan • ${nextHafazan.surah}` : "Pilih surah untuk rekod ayat"}</small></span><ChevronRight size={18}/></button><div className="grid grid-cols-2 gap-3"><button onClick={updatePbd} className="rounded-2xl bg-violet-50 p-3 text-left text-sm font-bold text-violet-900">PBD Hafazan<span className="mt-1 block text-xs font-normal opacity-70">Kini TP{student.pbd.Hafazan}</span></button><button onClick={updateExam} className="rounded-2xl bg-rose-50 p-3 text-left text-sm font-bold text-rose-900">Markah UASA<span className="mt-1 block text-xs font-normal opacity-70">Kini {student.ujian.UASA}%</span></button></div></div></SheetContent></Sheet>
    <Sheet open={sheet === "registerNfc"} onOpenChange={o => { if (!o) { setSheet(null); setScanState("idle"); } }}><SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-[2rem] border-0 px-5 pb-8"><div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-200"/><SheetHeader className="px-0 text-left"><SheetTitle className="text-xl">Daftar Kad NFC Murid</SheetTitle><SheetDescription>Kad akan dipautkan terus kepada profil yang telah dipilih. Nama murid tidak perlu ditaip semula.</SheetDescription></SheetHeader><div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Murid dipilih</p><b className="mt-1 block text-sm text-emerald-950">{student.nama}</b><p className="mt-1 text-xs text-emerald-800">{student.tingkatan}</p><code className="mt-2 inline-flex rounded-lg bg-white/80 px-2 py-1 text-[10px] text-emerald-800">UID semasa: {student.id}</code></div><div className="grid place-items-center py-5"><div className={`relative grid size-28 place-items-center rounded-full bg-emerald-50 ${scanState === "scanning" ? "scan-radar" : ""}`}><Nfc size={42} className={scanState === "scanning" ? "animate-pulse text-emerald-800" : "text-emerald-700"}/><span className="absolute inset-2 rounded-full border border-dashed border-emerald-400"/></div><p className="mt-4 text-center text-sm font-semibold text-slate-600">{scanState === "scanning" ? "Mengimbas… sentuhkan kad pada telefon" : scanState === "unsupported" ? "Web NFC tidak tersedia pada peranti ini" : "Sedia untuk mendaftarkan kad"}</p></div><button onClick={startNfcRegistration} disabled={scanState === "scanning"} className="w-full rounded-2xl bg-[#163c35] py-4 font-bold text-white disabled:bg-emerald-700">{scanState === "scanning" ? "Menunggu kad NFC…" : "Mulakan Imbasan Kad"}</button><div className="my-4 flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-300"><span className="h-px flex-1 bg-slate-200"/>atau masukkan UID<span className="h-px flex-1 bg-slate-200"/></div><label className="form-label">UID kad NFC<input value={nfcUidInput} onChange={e=>setNfcUidInput(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==="Enter")assignNfcUid(nfcUidInput)}} placeholder="Contoh: 04:A2:8B:12" className="form-input font-mono uppercase"/></label><button onClick={()=>assignNfcUid(nfcUidInput)} disabled={nfcUidInput.replace(/[\s:-]/g, "").length < 8} className="mt-3 w-full rounded-2xl bg-emerald-50 py-3.5 text-sm font-bold text-emerald-900 disabled:opacity-40">Simpan UID Kad</button>{scanState === "unsupported"&&<p className="mt-3 flex items-center justify-center gap-2 text-xs text-amber-700"><WifiOff size={14}/>Gunakan Chrome Android melalui HTTPS atau masukkan UID secara manual.</p>}</SheetContent></Sheet>
    <Sheet open={sheet === "hafazan"} onOpenChange={o => !o && setSheet(null)}><SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-[2rem] border-0 px-5 pb-8"><div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-200"/><SheetHeader className="px-0 text-left"><SheetTitle className="text-xl">Rekod Hafazan</SheetTitle><SheetDescription>Pilih surah dan masukkan ayat terakhir yang telah dihafaz.</SheetDescription></SheetHeader><div className="space-y-4"><label className="form-label">Surah<select value={hafazanSurah} onChange={e=>{const next=e.target.value,target=(TARGETS[student.tingkatan]||[]).find(x=>x.surah===next);setHafazanSurah(next);setHafazanAyat(String(targetProgress(student,target!)));}} className="form-input">{(TARGETS[student.tingkatan]||[]).map(target=><option key={target.surah} value={target.surah}>{target.surah} (hingga ayat {target.ayat})</option>)}</select></label><label className="form-label">Ayat terakhir<input type="number" inputMode="numeric" min="0" max={(TARGETS[student.tingkatan]||[]).find(x=>x.surah===hafazanSurah)?.ayat || 0} value={hafazanAyat} onChange={e=>setHafazanAyat(e.target.value)} className="form-input" placeholder="Contoh: 18"/></label><p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">Rekod semasa: ayat {targetProgress(student,(TARGETS[student.tingkatan]||[]).find(x=>x.surah===hafazanSurah)||{surah:"",ayat:0})}</p><button onClick={saveHafazan} className="w-full rounded-2xl bg-[#163c35] py-4 font-bold text-white">Simpan Rekod Hafazan</button></div></SheetContent></Sheet>
    <Sheet open={sheet === "addTask"} onOpenChange={o => { if (!o) { setSheet(null); setNewTaskTitle(""); setNewTaskForm(""); } }}><SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-[2rem] border-0 px-5 pb-8"><div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-200"/><SheetHeader className="px-0 text-left"><SheetTitle className="text-xl">Tambah Tugasan</SheetTitle><SheetDescription>Masukkan tajuk dan pilih Tingkatan yang akan menerima tugasan ini.</SheetDescription></SheetHeader><div className="space-y-4"><label className="form-label">Tajuk tugasan<input autoFocus value={newTaskTitle} onChange={e=>setNewTaskTitle(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&newTaskForm)saveNewTask()}} placeholder="Contoh: Latihan Tajwid 2" className="form-input" maxLength={100}/><span className="mt-1.5 block text-right text-[10px] font-medium text-slate-400">{newTaskTitle.length}/100</span></label><label className="form-label">Diberikan kepada<select value={newTaskForm} onChange={e=>setNewTaskForm(e.target.value)} className="form-input"><option value="">Pilih Tingkatan</option>{Object.keys(TARGETS).map(form=><option key={form} value={form}>{form}</option>)}</select></label></div><button onClick={saveNewTask} disabled={!newTaskTitle.trim()||!newTaskForm} className="mt-5 w-full rounded-2xl bg-[#163c35] py-4 font-bold text-white disabled:opacity-40"><Plus className="mr-2 inline" size={18}/>Simpan Tugasan</button></SheetContent></Sheet>
    {toast && <div className="fixed left-1/2 top-20 z-[70] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-slate-900 shadow-2xl"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check size={18} strokeWidth={3}/></span><span className="min-w-0"><b className="block text-sm">{toast}</b>{toast.includes("Identiti") && <small className="block text-xs text-slate-500">Profil murid sedia untuk dikemas kini</small>}</span></div>}
  </main>;
}

function LoadingScreen() {
  return <main className="grid min-h-dvh place-items-center bg-[#f4f6f3] px-6 text-slate-900"><div className="text-center"><div className="mx-auto grid size-16 place-items-center rounded-[1.4rem] bg-[#163c35] text-white shadow-xl"><BookOpenCheck size={28}/></div><div className="mx-auto mt-5 h-1.5 w-24 overflow-hidden rounded-full bg-emerald-100"><span className="block h-full w-1/2 animate-pulse rounded-full bg-emerald-700"/></div><p className="mt-3 text-sm font-semibold text-slate-500">Memuatkan rekod KKQ…</p></div></main>;
}

function TeacherLogin() {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signIn() {
    if (!supabase || !email.trim() || pin.length < 6) return;
    setBusy(true); setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pin });
    setBusy(false);
    if (authError) { setError("E-mel atau PIN tidak sah. Sila cuba semula."); }
  }
  return <main className="grid min-h-dvh place-items-center bg-[#f4f6f3] px-5 py-10 text-slate-900"><section className="w-full max-w-sm rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(22,60,53,.12)]"><div className="grid size-14 place-items-center rounded-[1.15rem] bg-[#163c35] text-white"><BookOpenCheck size={25}/></div><h1 className="mt-6 text-2xl font-black tracking-tight">Log masuk guru</h1><p className="mt-2 text-sm leading-6 text-slate-500">Masukkan e-mel dan PIN atau kata laluan. Tiada pautan pengesahan diperlukan untuk login harian.</p><div className="mt-6 space-y-4"><label className="form-label">E-mel guru<div className="relative mt-2"><Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18}/><input type="email" inputMode="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="guru@sekolah.edu.my" className="form-input mt-0 !pl-12 !pr-4 text-center placeholder:text-center"/></div></label><label className="form-label">PIN atau kata laluan<div className="relative mt-2"><LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18}/><input type="password" autoComplete="current-password" value={pin} onChange={e => setPin(e.target.value.slice(0, 72))} onKeyDown={e => { if (e.key === "Enter") signIn(); }} placeholder="Minimum 6 aksara" className="form-input mt-0 !pl-12 !pr-4 text-center placeholder:text-center" maxLength={72}/></div></label><button onClick={signIn} disabled={busy || !email.includes("@") || pin.length < 6} className="mt-2 w-full rounded-2xl bg-[#163c35] py-4 font-bold text-white disabled:opacity-40">{busy ? "Menyemak…" : "Log masuk"}</button>{error && <p className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600">{error}</p>}</div><p className="mt-6 text-center text-[11px] leading-5 text-slate-400">Setiap akaun guru hanya boleh melihat dan mengubah rekod miliknya sendiri.</p></section></main>;
}

function Dashboard({ students, sessions, tasks }: { students: Student[]; sessions: string[]; tasks: Task[] }) {
  const total = students.reduce((n, s) => n + Object.keys(s.attendance).length, 0), average = Math.round(total / (students.length * 5) * 100);
  return <div className="space-y-5"><p className="px-1 text-[13px] font-semibold text-slate-500">Sabtu, 29 Ogos 2026</p>
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat icon={Users} value={students.length.toString()} label="Murid" tone="emerald"/><Stat icon={CalendarCheck} value={`${average}%`} label="Kehadiran" tone="lime"/><Stat icon={ClipboardCheck} value={tasks.length.toString()} label="Tugasan" tone="sky"/><Stat icon={GraduationCap} value="4.6" label="Purata TP" tone="amber"/></section>
    <section className="card"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Perjumpaan seterusnya</p><h3 className="mt-1 font-black">Sesi 6 • {fmtDate(sessions[5])}</h3></div><span className="rounded-xl bg-lime-100 px-3 py-1.5 text-xs font-bold text-lime-800">Akan datang</span></div></section></div>;
}

function AttendanceView({ students, setStudents, sessions, sessionNo, setSessionNo, setSessions, onStudent, notify }: { students: Student[]; setStudents: React.Dispatch<React.SetStateAction<Student[]>>; sessions: string[]; sessionNo: number; setSessionNo: (n: number) => void; setSessions: (x: string[]) => void; onStudent: (id: string) => void; notify: (msg:string)=>void }) {
  const [form, setForm] = useState("");
  const [search, setSearch] = useState("");
  const [rapidScanState, setRapidScanState] = useState<"idle"|"scanning"|"unsupported">("idle");
  const filtered = filterStudentRecords(students, form, search);
  const present = filtered.filter(s => s.attendance[sessionNo]);
  const attendanceRate = filtered.length ? Math.round(present.length / filtered.length * 100) : 0;
  async function startRapidAttendance() {
    setRapidScanState("scanning");
    const NDEF = (window as unknown as { NDEFReader?: new () => { scan(): Promise<void>; onreading: ((e: { serialNumber?: string }) => void) | null } }).NDEFReader;
    if (!NDEF) { setRapidScanState("unsupported"); return; }
    try {
      const reader = new NDEF();
      await reader.scan();
      reader.onreading = e => {
        const uid = (e.serialNumber || "").replace(/[\s:-]/g, "").toUpperCase();
        if (!uid) return;
        setStudents(xs => {
          const found = xs.find(s => s.id.replace(/[\s:-]/g, "").toUpperCase() === uid);
          if (!found) { notify("Kad NFC belum didaftarkan"); navigator.vibrate?.([80,50,80]); return xs; }
          if (found.attendance[sessionNo]) { notify(`${found.nama} sudah hadir`); navigator.vibrate?.(60); return xs; }
          notify(`✓ ${found.nama} — HADIR`); navigator.vibrate?.(100);
          return xs.map(s => s.id === found.id ? { ...s, attendance: { ...s.attendance, [sessionNo]: new Date().toISOString() } } : s);
        });
      };
    } catch { setRapidScanState("unsupported"); }
  }
  return <div className="space-y-5"><PageTitle title="Kehadiran KKQ" note="Pilih tingkatan dahulu, kemudian cari murid"/><StudentRecordFilter form={form} setForm={setForm} search={search} setSearch={setSearch}/>{!form?<ChooseFormEmpty text="Pilih tingkatan untuk memaparkan rekod kehadiran."/>:<><div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">{sessions.map((date, i) => <button key={date+i} onClick={() => setSessionNo(i+1)} className={`min-w-24 rounded-2xl p-3 text-left ${sessionNo === i+1 ? "bg-[#163c35] text-white shadow-lg" : "bg-white text-slate-600"}`}><b className="block text-sm">Sesi {i+1}</b><small className={sessionNo === i+1 ? "text-emerald-200" : "text-slate-400"}>{fmtDate(date).replace(" 2026", "")}</small></button>)}</div>
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-full bg-[#163c35] text-white"><Nfc size={20}/></span><div className="min-w-0 flex-1"><b className="block text-sm text-emerald-950">Imbas Kehadiran Pantas</b><p className="text-xs text-emerald-700">Sesi {sessionNo} • sentuh kad satu demi satu</p></div></div><button onClick={startRapidAttendance} disabled={rapidScanState === "scanning"} className="mt-3 w-full rounded-2xl bg-[#163c35] py-3.5 text-sm font-bold text-white disabled:bg-emerald-700">{rapidScanState === "scanning" ? "Pengimbas aktif — sentuh kad seterusnya" : "Mula Imbas NFC"}</button>{rapidScanState === "unsupported"&&<p className="mt-2 text-center text-xs font-semibold text-amber-700">Web NFC tidak tersedia. Gunakan Chrome Android melalui HTTPS.</p>}</section>
    <section className="card"><div className="flex items-center gap-4"><div className="grid size-16 place-items-center rounded-2xl bg-emerald-50 text-2xl font-black text-emerald-800">{present.length}/{filtered.length}</div><div className="flex-1"><b>Kehadiran Sesi {sessionNo}</b><p className="text-sm text-slate-500">{attendanceRate}% murid hadir</p><Progress value={attendanceRate} className="mt-3 bg-emerald-100 [&_[data-slot=progress-indicator]]:bg-emerald-700"/></div></div><label className="mt-4 block text-xs font-bold text-slate-500">Tarikh perjumpaan<input type="date" value={sessions[sessionNo-1]} onChange={e => setSessions(sessions.map((d,i) => i === sessionNo-1 ? e.target.value : d))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"/></label></section>
    <section><SectionTitle title="Senarai murid" note={`${present.length} hadir`}/><div className="space-y-2">{filtered.length?filtered.map(s => <StudentRow key={s.id} student={s} status={s.attendance[sessionNo] ? "Hadir" : "Belum"} good={!!s.attendance[sessionNo]} onClick={() => onStudent(s.id)}/>):<RecordEmpty/>}</div></section></>}</div>;
}

function TasksView({ students, setStudents, tasks, taskId, setTaskId, setTasks, onAddTask, notify }: { students: Student[]; setStudents: React.Dispatch<React.SetStateAction<Student[]>>; tasks: Task[]; taskId: string; setTaskId: (x:string)=>void; setTasks:(x:Task[])=>void; onAddTask:(form?:string)=>void; notify:(msg:string)=>void }) {
  const [form, setForm] = useState("");
  const [search, setSearch] = useState("");
  const [rapidScanState, setRapidScanState] = useState<"idle"|"scanning"|"unsupported">("idle");
  const filtered = filterStudentRecords(students, form, search);
  const formTasks = tasks.filter(task => task.tingkatan === form);
  const unassignedTasks = tasks.filter(task => !task.tingkatan || !TARGETS[task.tingkatan]);
  const current = formTasks.find(t => t.id === taskId) || formTasks[0], done = filtered.filter(s => s.tasks[current?.id]?.statusHantar).length;
  const taskRate = filtered.length ? Math.round(done / filtered.length * 100) : 0;
  function changeForm(nextForm: string) { setForm(nextForm); setSearch(""); setTaskId(tasks.find(task => task.tingkatan === nextForm)?.id || ""); setRapidScanState("idle"); }
  function assignOldTask(id: string) { setTasks(tasks.map(task => task.id === id ? { ...task, tingkatan: form } : task)); if (!taskId) setTaskId(id); }
  async function startRapidTask() {
    if (!current) return;
    setRapidScanState("scanning");
    const NDEF = (window as unknown as { NDEFReader?: new () => { scan(): Promise<void>; onreading: ((e: { serialNumber?: string }) => void) | null } }).NDEFReader;
    if (!NDEF) { setRapidScanState("unsupported"); return; }
    try {
      const reader = new NDEF();
      await reader.scan();
      reader.onreading = e => {
        const uid = (e.serialNumber || "").replace(/[\s:-]/g, "").toUpperCase();
        if (!uid) return;
        setStudents(xs => {
          const found = xs.find(s => s.id.replace(/[\s:-]/g, "").toUpperCase() === uid);
          if (!found) { notify("Kad NFC belum didaftarkan"); navigator.vibrate?.([80,50,80]); return xs; }
          if (found.tingkatan !== current.tingkatan) { notify(`${found.nama} bukan ${current.tingkatan}`); navigator.vibrate?.([80,50,80]); return xs; }
          if (found.tasks[current.id]?.statusHantar) { notify(`${found.nama} sudah hantar tugasan`); navigator.vibrate?.(60); return xs; }
          notify(`✓ ${found.nama} — SUDAH HANTAR`); navigator.vibrate?.(100);
          return xs.map(s => s.id === found.id ? { ...s, tasks: { ...s.tasks, [current.id]: { statusHantar: true, tarikhHantar: today() } } } : s);
        });
      };
    } catch { setRapidScanState("unsupported"); }
  }
  return <div className="space-y-5"><PageTitle title="Tugasan Buku" note="Pilih tingkatan dahulu, kemudian cari murid" action={<button onClick={()=>onAddTask(form)} aria-label="Tambah tugasan" className="grid size-11 place-items-center rounded-2xl bg-[#163c35] text-white"><Plus/></button>}/><StudentRecordFilter form={form} setForm={changeForm} search={search} setSearch={setSearch}/>{!form?<ChooseFormEmpty text="Pilih tingkatan untuk memaparkan rekod tugasan."/>:<>{unassignedTasks.length>0&&<section className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><b className="text-sm text-amber-950">{unassignedTasks.length} tugasan lama belum mempunyai Tingkatan</b><p className="mt-1 text-xs leading-5 text-amber-800">Tetapkan tugasan berikut kepada {form} jika sesuai.</p><div className="mt-3 space-y-2">{unassignedTasks.map(task=><button key={task.id} onClick={()=>assignOldTask(task.id)} className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 text-left text-xs font-bold text-slate-700 shadow-sm"><span className="truncate">{task.tajuk}</span><span className="shrink-0 text-amber-700">Tetapkan</span></button>)}</div></section>}{formTasks.length?<><div className="scrollbar-none flex gap-2 overflow-x-auto">{formTasks.map(t => <button key={t.id} onClick={()=>{setTaskId(t.id);setRapidScanState("idle")}} className={`min-w-48 rounded-2xl p-4 text-left ${current?.id===t.id ? "bg-sky-900 text-white" : "bg-white"}`}><BookOpenCheck size={19}/><b className="mt-3 block text-sm">{t.tajuk}</b><small className={current?.id===t.id ? "text-sky-200" : "text-slate-400"}>{t.tingkatan} • {fmtDate(t.tarikh)}</small></button>)}</div><section className="rounded-2xl border border-sky-200 bg-sky-50 p-4"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-full bg-sky-900 text-white"><Nfc size={20}/></span><div className="min-w-0 flex-1"><b className="block truncate text-sm text-sky-950">Imbas Hantar Tugasan Pantas</b><p className="truncate text-xs text-sky-700">{current?.tajuk}</p></div></div><button onClick={startRapidTask} disabled={rapidScanState === "scanning"} className="mt-3 w-full rounded-2xl bg-sky-900 py-3.5 text-sm font-bold text-white disabled:bg-sky-700">{rapidScanState === "scanning" ? "Pengimbas aktif — sentuh kad seterusnya" : "Mula Imbas NFC"}</button>{rapidScanState === "unsupported"&&<p className="mt-2 text-center text-xs font-semibold text-amber-700">Web NFC tidak tersedia. Gunakan Chrome Android melalui HTTPS.</p>}</section><section className="card"><div className="flex justify-between"><div><p className="text-sm text-slate-500">Telah menghantar</p><p className="text-3xl font-black">{done}<span className="text-base text-slate-400">/{filtered.length}</span></p></div><span className="grid size-14 place-items-center rounded-2xl bg-sky-50 font-black text-sky-800">{taskRate}%</span></div><Progress value={taskRate} className="mt-4 bg-sky-100 [&_[data-slot=progress-indicator]]:bg-sky-700"/></section><div className="space-y-2">{filtered.length?filtered.map(s => <StudentRow key={s.id} student={s} status={s.tasks[current?.id]?.statusHantar ? "Sudah" : "Belum"} good={!!s.tasks[current?.id]?.statusHantar}/>):<RecordEmpty/>}</div><button onClick={()=>{ if(current&&confirm("Padam tugasan ini?")){ const next=tasks.filter(t=>t.id!==current.id); setTasks(next); setTaskId(next.find(t=>t.tingkatan===form)?.id||""); }}} className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-red-600"><Trash2 size={17}/>Padam tugasan</button></>:<div className="rounded-2xl bg-white p-8 text-center"><BookOpenCheck className="mx-auto text-slate-300"/><p className="mt-3 text-sm font-medium text-slate-400">Belum ada tugasan untuk {form}.</p><button onClick={()=>onAddTask(form)} className="mt-4 rounded-xl bg-[#163c35] px-4 py-2.5 text-xs font-bold text-white">Tambah tugasan</button></div>}</>}</div>;
}

function HafazanView({ students, onStudent }: { students: Student[]; onStudent: (id:string)=>void }) {
  const [form, setForm] = useState("");
  const [search, setSearch] = useState("");
  const filtered = filterStudentRecords(students, form, search);
  const targets = TARGETS[form] || [];
  return <div className="space-y-5"><PageTitle title="Perkembangan Hafazan" note="Pilih tingkatan dahulu, kemudian cari murid"/><StudentRecordFilter form={form} setForm={setForm} search={search} setSearch={setSearch}/>{!form?<ChooseFormEmpty text="Pilih tingkatan untuk memaparkan rekod hafazan."/>:<><section className="card"><div className="mb-4 flex items-center justify-between"><div><span className="badge bg-amber-100 text-amber-800">{form}</span><p className="mt-2 text-xs text-slate-400">{filtered.length} murid dipaparkan • {targets.length} surah</p></div></div><div className="space-y-3">{targets.map(target=>{const group=students.filter(s=>s.tingkatan===form),progress=group.length?Math.round(group.reduce((n,s)=>n+targetProgress(s,target)/target.ayat*100,0)/group.length):0;return <div key={target.surah} className="rounded-2xl bg-amber-50/80 p-3"><div className="flex justify-between gap-3 text-sm"><b>{target.surah}</b><span className="font-black text-amber-800">{progress}%</span></div><p className="mt-1 text-xs text-slate-500">Sasaran {target.ayat} ayat</p><Progress value={progress} className="mt-2 bg-amber-100 [&_[data-slot=progress-indicator]]:bg-amber-500"/></div>})}</div></section><section><SectionTitle title="Rekod murid"/><div className="space-y-2">{filtered.length?filtered.map(s => { const summary=overallHafazan(s), active=activeHafazanTarget(s); return <button key={s.id} onClick={()=>onStudent(s.id)} className="card flex w-full items-center gap-3 text-left"><Avatar student={s}/><div className="min-w-0 flex-1"><b className="block truncate text-sm">{s.nama}</b><p className="truncate text-xs text-slate-400">{active ? `Seterusnya: ${active.surah} • ${targetProgress(s,active)}/${active.ayat} ayat` : "Semua sasaran lengkap"}</p><Progress value={summary.progress} className="mt-2 h-1.5 bg-amber-100 [&_[data-slot=progress-indicator]]:bg-amber-500"/></div><span className={`badge ${summary.progress===100?"bg-emerald-100 text-emerald-700":"bg-amber-100 text-amber-700"}`}>{summary.progress}%</span></button>}):<RecordEmpty/>}</div></section></>}</div>;
}

function PbdMarkahView({ students, onPbdChange, onExamChange }: { students: Student[]; onPbdChange: (id:string, kemahiran:string, tp:number)=>void; onExamChange: (id:string, ujian:string, markah:number)=>void }) {
  const [form, setForm] = useState("");
  const [search, setSearch] = useState("");
  const filtered = filterStudentRecords(students, form, search);
  const averageTp = filtered.length ? (filtered.reduce((sum, s) => sum + PBD_SKILLS.reduce((n, key) => n + (s.pbd[key] || 0), 0) / PBD_SKILLS.length, 0) / filtered.length).toFixed(1) : "0.0";
  const averageUasa = filtered.length ? Math.round(filtered.reduce((sum, s) => sum + (s.ujian.UASA || 0), 0) / filtered.length) : 0;
  return <div className="space-y-5"><PageTitle title="PBD & Markah" note="Pilih tingkatan dahulu, kemudian cari murid"/><StudentRecordFilter form={form} setForm={setForm} search={search} setSearch={setSearch}/>{!form?<ChooseFormEmpty text="Pilih tingkatan untuk memaparkan rekod PBD dan markah."/>:<>
    <section className="grid grid-cols-2 gap-3"><div className="card"><span className="grid size-9 place-items-center rounded-xl bg-violet-50 text-violet-700"><GraduationCap size={18}/></span><b className="mt-3 block text-2xl">TP{averageTp}</b><small className="text-slate-400">Purata PBD</small></div><div className="card"><span className="grid size-9 place-items-center rounded-xl bg-rose-50 text-rose-700"><ClipboardCheck size={18}/></span><b className="mt-3 block text-2xl">{averageUasa}%</b><small className="text-slate-400">Purata UASA</small></div></section>
    <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">Perubahan disimpan secara automatik ke Supabase.</p>
    <section className="space-y-3">{filtered.length?filtered.map(s => <article key={s.id} className="card"><div className="flex items-center gap-3"><Avatar student={s}/><div className="min-w-0"><h3 className="truncate text-sm font-black">{s.nama}</h3><p className="text-xs text-slate-400">{s.tingkatan}</p></div></div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{PBD_SKILLS.map(skill => <label key={skill} className="rounded-xl bg-violet-50 p-2 text-[10px] font-bold text-violet-700">{skill}<select aria-label={`${skill} untuk ${s.nama}`} value={s.pbd[skill] || 1} onChange={e=>onPbdChange(s.id, skill, Number(e.target.value))} className="mt-1 w-full bg-transparent text-base font-black text-violet-950 outline-none">{[1,2,3,4,5,6].map(tp=><option key={tp} value={tp}>TP{tp}</option>)}</select></label>)}</div>
      <div className="mt-3 grid grid-cols-2 gap-2">{["Ujian 1", "UASA"].map(test => <label key={test} className="rounded-xl bg-slate-50 p-2 text-[10px] font-bold text-slate-500">{test}<span className="mt-1 flex items-center"><input aria-label={`${test} untuk ${s.nama}`} type="number" inputMode="numeric" min="0" max="100" value={s.ujian[test] ?? 0} onChange={e=>onExamChange(s.id, test, Math.max(0, Math.min(100, Number(e.target.value))))} className="w-full bg-transparent text-base font-black text-slate-900 outline-none"/><b className="text-xs text-slate-400">%</b></span></label>)}</div>
    </article>):<RecordEmpty/>}</section></>}</div>;
}

function ProfileView({ students, search, setSearch, profileForm, setProfileForm, onStudent }: { students:Student[]; search:string; setSearch:(x:string)=>void; profileForm:string; setProfileForm:(x:string)=>void; onStudent:(id:string)=>void }) {
  return <div className="space-y-5"><PageTitle title="Profil Murid" note="Pilih tingkatan dahulu, kemudian cari murid"/><label className="form-label">Tingkatan<select value={profileForm} onChange={e=>setProfileForm(e.target.value)} className="form-input mt-2"><option value="">Pilih Tingkatan</option>{Object.keys(TARGETS).map(form=><option key={form} value={form}>{form}</option>)}</select></label><label className="flex items-center gap-3 rounded-2xl bg-white px-4 shadow-sm"><Search size={20} className="text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari nama atau UID kad NFC..." disabled={!profileForm} className="w-full bg-transparent py-4 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-40"/>{search&&<button onClick={()=>setSearch("")}><X size={18}/></button>}</label>{!profileForm?<div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-sm font-medium text-slate-400">Pilih tingkatan untuk memaparkan profil murid.</div>:<div className="space-y-3">{students.length?students.map(s=><button key={s.id} onClick={()=>onStudent(s.id)} className="card flex w-full items-center gap-4 text-left"><Avatar student={s} large/><div className="min-w-0 flex-1"><h3 className="truncate font-black">{s.nama}</h3><p className="text-sm text-slate-500">{s.tingkatan}</p><code className="mt-1 block text-[11px] text-emerald-700">{s.id}</code></div><ChevronRight className="text-slate-300"/></button>):<div className="rounded-2xl bg-white p-8 text-center text-sm font-medium text-slate-400">Tiada murid ditemui.</div>}</div>}</div>;
}

function StudentRecordFilter({ form, setForm, search, setSearch }: { form:string; setForm:(value:string)=>void; search:string; setSearch:(value:string)=>void }) {
  return <><label className="form-label">Tingkatan<select value={form} onChange={e=>setForm(e.target.value)} className="form-input mt-2"><option value="">Pilih Tingkatan</option>{Object.keys(TARGETS).map(item=><option key={item} value={item}>{item}</option>)}</select></label><label className="flex items-center gap-3 rounded-2xl bg-white px-4 shadow-sm"><Search size={20} className="text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari nama atau UID kad NFC..." disabled={!form} className="w-full bg-transparent py-4 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-40"/>{search&&<button type="button" onClick={()=>setSearch("")} aria-label="Kosongkan carian"><X size={18}/></button>}</label></>;
}

function ChooseFormEmpty({ text }: { text:string }) { return <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-sm font-medium text-slate-400">{text}</div> }
function RecordEmpty() { return <div className="rounded-2xl bg-white p-8 text-center text-sm font-medium text-slate-400">Tiada murid ditemui.</div> }

function StudentCard({ student, tasks, onPhotoChange }: { student:Student; tasks:Task[]; onPhotoChange:(file?:File)=>void }) {
  const summary=overallHafazan(student), active=activeHafazanTarget(student), done=tasks.filter(t=>student.tasks[t.id]?.statusHantar).length, latest=Object.values(student.ujian).at(-1)||0;
  return <div><div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-200"/><div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-700 text-white shadow-sm"><Check size={20} strokeWidth={3}/></span><span><b className="block text-sm text-emerald-950">Identiti murid disahkan</b><small className="text-xs text-emerald-700">Kad NFC berjaya dipadankan dengan rekod</small></span></div><div className="mt-3 flex items-center gap-4 rounded-[1.4rem] border border-slate-200 bg-white p-4 shadow-sm"><label className="group relative shrink-0 cursor-pointer" title="Tukar foto murid"><Avatar student={student} large/><span className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full border-2 border-white bg-[#163c35] text-white shadow-md transition group-active:scale-90"><Camera size={13}/></span><input type="file" accept="image/*" className="sr-only" onChange={e=>{onPhotoChange(e.target.files?.[0]);e.currentTarget.value=""}}/></label><div className="min-w-0 flex-1"><h2 className="truncate text-xl font-black tracking-tight">{student.nama}</h2><p className="mt-0.5 text-sm font-medium text-slate-500">{student.tingkatan}</p><code className="mt-2 inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">UID {student.id}</code><label className="mt-2 block cursor-pointer text-xs font-bold text-emerald-700">{student.fotoUrl?"Tukar foto":"Muat naik foto"}<input type="file" accept="image/*" className="sr-only" onChange={e=>{onPhotoChange(e.target.files?.[0]);e.currentTarget.value=""}}/></label></div></div><div className="mt-4 grid grid-cols-3 gap-2"><MiniStat value={`${Object.keys(student.attendance).length}/12`} label="Hadir"/><MiniStat value={`${done}/${tasks.length}`} label="Tugasan"/><MiniStat value={`${latest}%`} label="Ujian"/></div><div className="mt-3 rounded-2xl bg-amber-50 p-4"><div className="flex justify-between text-sm"><b>Hafazan keseluruhan</b><b className="text-amber-800">{summary.progress}%</b></div><p className="mt-1 text-xs text-slate-500">{summary.done}/{summary.total} ayat • {summary.targets.length} surah</p><Progress value={summary.progress} className="mt-3 bg-amber-100 [&_[data-slot=progress-indicator]]:bg-amber-500"/><div className="mt-4 space-y-3">{summary.targets.map(target=>{const current=targetProgress(student,target),progress=Math.round(current/target.ayat*100);return <div key={target.surah} className={`rounded-xl p-3 ${target===active?"bg-amber-100":"bg-white/80"}`}><div className="flex justify-between gap-3 text-xs"><b>{target.surah}</b><span className="font-black text-amber-800">{current}/{target.ayat} ayat</span></div><Progress value={progress} className="mt-2 h-1.5 bg-amber-200 [&_[data-slot=progress-indicator]]:bg-amber-500"/></div>})}</div></div><div className="mt-3 rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">PBD terkini</p><div className="mt-2 grid grid-cols-2 gap-2">{PBD_SKILLS.map(k=><span key={k} className="rounded-xl bg-white px-3 py-2 text-xs shadow-sm"><b className="block text-emerald-800">TP{student.pbd[k] || 1}</b>{k}</span>)}</div></div></div>;
}
function NavItem({ item, tab, setTab }: { item: typeof nav[number]; tab: Tab; setTab: (tab: Tab) => void }) { const Icon = item.icon; const active = tab === item.id; return <button onClick={() => setTab(item.id)} className={`flex min-h-[3.35rem] flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-semibold transition-colors ${active ? "bg-emerald-50 text-emerald-800" : "text-slate-400 active:bg-slate-50"}`}><Icon size={18} strokeWidth={active ? 2.5 : 2}/>{item.label}</button> }
function Avatar({student,large=false}:{student:Student;large?:boolean}) { return <div className={`grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-100 to-lime-100 font-black text-emerald-900 ${large?"size-16 text-lg":"size-11 text-sm"}`}>{student.fotoUrl?<img src={student.fotoUrl} alt="" className="size-full rounded-2xl object-cover"/>:initials(student.nama)}</div> }
function Stat({icon:Icon,value,label,tone}:{icon:typeof Users;value:string;label:string;tone:string}) { const c:Record<string,string>={emerald:"bg-emerald-50 text-emerald-800",lime:"bg-lime-100 text-lime-800",sky:"bg-sky-50 text-sky-800",amber:"bg-amber-50 text-amber-800"}; return <div className="card p-4"><span className={`grid size-9 place-items-center rounded-xl ${c[tone]}`}><Icon size={18}/></span><b className="mt-3 block text-xl">{value}</b><small className="text-slate-400">{label}</small></div> }
function StudentRow({student,status,good,onClick}:{student:Student;status:string;good:boolean;onClick?:()=>void}) { return <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm"><Avatar student={student}/><span className="min-w-0 flex-1"><b className="block truncate text-sm">{student.nama}</b><small className="text-slate-400">{student.tingkatan}</small></span><span className={`badge ${good?"bg-emerald-100 text-emerald-700":"bg-red-50 text-red-600"}`}>{status}</span></button> }
function MiniStat({value,label}:{value:string;label:string}) { return <div className="rounded-2xl bg-slate-50 p-3 text-center"><b className="block text-lg">{value}</b><small className="text-slate-400">{label}</small></div> }
function PageTitle({title,note,action}:{title:string;note:string;action?:React.ReactNode}) { return <div className="flex items-center justify-between"><div><h2 className="text-2xl font-black tracking-tight">{title}</h2><p className="text-sm text-slate-500">{note}</p></div>{action}</div> }
function SectionTitle({title,note}:{title:string;note?:string}) { return <div className="mb-3 flex items-center justify-between"><h3 className="font-black">{title}</h3>{note&&<span className="text-xs font-bold text-slate-400">{note}</span>}</div> }
