import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here
import Login from './pages/Login';
import Layout from '@/components/Layout';
import Home from './pages/Home';
import Lessons from './pages/Lessons';
import LessonPlans from './pages/LessonPlans';
import Quizzes from './pages/Quizzes';
import Notes from './pages/Notes';
import QuizDetail from './pages/QuizDetail';
import LessonDetail from './pages/LessonDetail';
import AssignmentDetail from './pages/AssignmentDetail';
import TeacherDashboard from './pages/TeacherDashboard';
import Grades from './pages/Grades';
import AssignmentsPage from './pages/Assignments';
import CalendarPage from './pages/Calendar';
import Assign from './pages/Assign';
import ReviewPractices from './pages/ReviewPractices';
import Messages from './pages/Messages';
import Links from './pages/Links';
import DoNow from './pages/DoNow';
import DoNowManager from './pages/DoNowManager';
import PreviewStudent from './pages/PreviewStudent';
import Vocabulary from './pages/Vocabulary';
import CFAs from './pages/CFAs';
import RealtimeSync from '@/components/RealtimeSync';
import { PreviewProvider } from '@/lib/PreviewContext';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      return <Login />;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Add your page Route elements here */}
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/lessons" element={<Lessons />} />
        <Route path="/lesson-plan" element={<LessonPlans />} />
        <Route path="/quizzes" element={<Quizzes />} />
        <Route path="/notes" element={<Notes />} />
        <Route path="/quiz" element={<QuizDetail />} />
        <Route path="/lessons/:id" element={<LessonDetail />} />
        <Route path="/assignments/:id" element={<AssignmentDetail />} />
        <Route path="/teacher" element={<TeacherDashboard />} />
        <Route path="/grades" element={<Grades />} />
        <Route path="/assignments" element={<AssignmentsPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/assign" element={<Assign />} />
        <Route path="/review" element={<ReviewPractices />} />
        <Route path="/preview-student" element={<PreviewStudent />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/links" element={<Links />} />
        <Route path="/do-now" element={<DoNow />} />
        <Route path="/vocabulary" element={<Vocabulary />} />
        <Route path="/cfa" element={<CFAs />} />
        <Route path="/teacher/do-nows" element={<DoNowManager />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <PreviewProvider>
          <RealtimeSync />
          <AuthenticatedApp />
          </PreviewProvider>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App