import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import UploadCenter from './pages/UploadCenter.jsx';
import DocumentIntelligence from './pages/DocumentIntelligence.jsx';
import ValidationCenter from './pages/ValidationCenter.jsx';
import AIInsights from './pages/AIInsights.jsx';

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="h-12 w-12 animate-spin rounded-2xl border-4 border-emerald-500/20 border-t-emerald-500" />
    </div>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login mode="login" /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Login mode="register" /></PublicOnly>} />
      <Route element={<Protected><AppLayout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="upload" element={<UploadCenter />} />
        <Route path="documents" element={<DocumentIntelligence />} />
        <Route path="documents/:id" element={<DocumentIntelligence />} />
        <Route path="validation" element={<ValidationCenter />} />
        <Route path="insights" element={<AIInsights />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
