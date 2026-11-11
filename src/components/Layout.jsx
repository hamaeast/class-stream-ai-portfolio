import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { SCHOOL_SHORT_NAME, COURSE_NAME } from "@/lib/schoolConfig";
import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { appParams } from "@/lib/app-params";
import { Home as HomeIcon, BookOpen, ClipboardList, ClipboardCheck, LogOut, MessageSquare, Users, Eye, X, HelpCircle, Award, FileText, Calendar, ListChecks, CircuitBoard, NotebookPen, Link2, Timer, AlarmClock, BookMarked } from "lucide-react";
import { Button } from "@/components/ui/button";
import StudentMessages from "@/components/StudentMessages";
import DoNowModal from "@/components/DoNowModal";
import CircuitBackground from "@/components/CircuitBackground";
import { cn } from "@/lib/utils";
import { usePreview } from "@/lib/PreviewContext";


export default function Layout() {
  const [user, setUser] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { previewStudent, exitPreview } = usePreview();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const isAdmin = user?.role === "admin";
  const handleSignOut = () => {
    try {
      window.localStorage.removeItem("base44_access_token");
      window.localStorage.removeItem("token");
    } catch (e) {}
    const back = window.location.origin + "/";
    // Clear the session cookie, then start Google login with account chooser
    const loginUrl = `/api/apps/auth/login?app_id=${appParams.appId}&from_url=${encodeURIComponent(back)}&prompt=select_account`;
    window.location.href = `/api/apps/auth/logout?from_url=${encodeURIComponent(loginUrl)}`;
  };
  const initials = user?.full_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "S";

  const navItems = [
    { to: "/", label: "Dashboard", icon: HomeIcon },
    { to: "/links", label: "Links", icon: Link2 },
    { to: "/lessons", label: "Lessons", icon: BookOpen },
    { to: "/assignments", label: "Assignments", icon: FileText },
    { to: "/quizzes", label: "Quizzes", icon: HelpCircle },
    { to: "/notes", label: "Notes", icon: NotebookPen },
    { to: "/vocabulary", label: "Vocabulary", icon: BookMarked },
    { to: "/cfa", label: "CFAs", icon: ClipboardList },
    { to: "/grades", label: "Grades", icon: Award },
    { to: "/calendar", label: "Calendar", icon: Calendar },
  ];
  if (isAdmin) {
    navItems.push({ to: "/teacher/do-nows", label: "Do Now Manager", icon: AlarmClock });
    navItems.push({ to: "/teacher", label: "Teacher", icon: ClipboardList });
    navItems.push({ to: "/vocabulary", label: "Vocabulary", icon: BookMarked });
    navItems.push({ to: "/assign", label: "Assign", icon: ListChecks });
    navItems.push({ to: "/review", label: "Review", icon: ClipboardCheck });
    navItems.push({ to: "/preview-student", label: "Preview Student", icon: Users });
    navItems.push({ to: "/messages", label: "Messages", icon: MessageSquare });
  } else {
    navItems.push({ to: "/do-now", label: "Do Now", icon: Timer });
    navItems.push({ to: "/messages", label: "Messages", icon: MessageSquare });
  }

  const isActive = (path) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <div className={cn("flex min-h-screen relative", previewStudent && "preview-mode")}>
      <CircuitBackground />
      <aside className="hidden md:flex w-64 flex-col border-r border-stone-200 bg-card sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-6 h-16 border-b border-stone-200">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center ring-1 ring-primary/40 shrink-0 bg-primary/10">
            <CircuitBoard className="w-5 h-5 text-primary" />
          </div>
          <Link to="/" className="min-w-0">
            <span className="block font-display font-bold text-lg leading-tight bg-gradient-to-r from-[#22D3EE] via-[#FF2BD6] to-[#39FF14] bg-clip-text text-transparent">{SCHOOL_SHORT_NAME}</span>
            <span className="block font-display font-semibold text-xs leading-tight bg-gradient-to-r from-[#22D3EE] via-[#FF2BD6] to-[#39FF14] bg-clip-text text-transparent">Computer Science</span>
          </Link>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive(item.to)
                    ? "bg-primary text-white"
                    : "text-stone-600 hover:bg-stone-100",
                  item.to === "/do-now" && !isActive(item.to) && "text-[#FF2BD6] font-semibold hover:bg-[#FF2BD6]/10"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-stone-200">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-9 h-9 rounded-full bg-stone-200 flex items-center justify-center text-sm font-semibold text-stone-700">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{user?.full_name || "Student"}</p>
              <p className="text-[11px] text-stone-500 truncate">
                {isAdmin ? "Teacher" : user?.grade && user?.class_period ? `Grade ${user.grade} · Period ${user.class_period}` : "Student"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-stone-500 mt-1"
            onClick={handleSignOut}
          >
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="print:hidden md:hidden fixed top-0 inset-x-0 z-30 h-14 bg-card border-b border-stone-200 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center ring-1 ring-primary/40 shrink-0 bg-primary/10">
            <CircuitBoard className="w-4 h-4 text-primary" />
          </div>
          <span className="font-display font-bold text-sm whitespace-nowrap bg-gradient-to-r from-[#22D3EE] via-[#FF2BD6] to-[#39FF14] bg-clip-text text-transparent">{SCHOOL_SHORT_NAME} {COURSE_NAME}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-foreground">
          <LogOut className="w-4 h-4 mr-1" /> Sign out
        </Button>
      </div>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 h-16 bg-card border-t border-stone-200 flex items-center justify-around px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-[11px] font-medium",
                isActive(item.to) ? "text-foreground" : "text-stone-400",
                item.to === "/do-now" && !isActive(item.to) && "text-[#FF2BD6] font-semibold"
              )}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <main className="flex-1 min-w-0 pt-14 md:pt-0 pb-20 md:pb-0">
        {previewStudent && (
          <div className="print:hidden sticky top-0 z-20 flex items-center gap-2 px-4 py-2 bg-amber-100 border-b border-amber-300 text-amber-900 text-sm">
            <Eye className="w-4 h-4 shrink-0" />
            <span className="font-medium">
              Previewing as {previewStudent.full_name}
            </span>
            {previewStudent.class_period && (
              <span className="text-amber-700">· Period {previewStudent.class_period}</span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7 border-amber-400 text-amber-900 hover:bg-amber-200"
              onClick={() => {
                exitPreview();
                navigate("/preview-student");
              }}
            >
              <X className="w-3.5 h-3.5 mr-1" /> Exit preview
            </Button>
          </div>
        )}
        <Outlet />
      </main>

      <div className="print:hidden">{!isAdmin && user && <StudentMessages user={user} />}</div>
      {!isAdmin && user && <DoNowModal />}
    </div>
  );
}