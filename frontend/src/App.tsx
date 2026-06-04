import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./Layout";
import Home from "./pages/Home";
import AdminHome from "./pages/AdminHome";
import AgentChat from "./pages/AgentChat";
import ExpertInterview from "./pages/ExpertInterview";
import KnowledgeSynthesis from "./pages/KnowledgeSynthesis";
import ReviewApprove from "./pages/ReviewApprove";
import SmeOnboarding from "./pages/SmeOnboarding";
import SmeProfile from "./pages/SmeProfile";
import UploadMaterials from "./pages/UploadMaterials";
import SweDirectory from "./pages/SweDirectory";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/admin" element={<AdminHome />} />
          <Route path="/profile" element={<SmeProfile />} />
          <Route path="/interview" element={<ExpertInterview />} />
          <Route path="/materials" element={<UploadMaterials />} />
          <Route path="/synthesis" element={<KnowledgeSynthesis />} />
          <Route path="/review" element={<ReviewApprove />} />
          <Route path="/onboarding" element={<SmeOnboarding />} />
          <Route path="/chat" element={<AgentChat />} />
          <Route path="/directory" element={<SweDirectory />} />
          <Route path="/directory/:id" element={<SweDirectory />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
