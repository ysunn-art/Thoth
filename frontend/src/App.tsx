import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./Layout";
import Home from "./pages/Home";
import AdminHome from "./pages/AdminHome";
import AgentChat from "./pages/AgentChat";
import SweDirectory from "./pages/SweDirectory";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<AdminHome />} />
          <Route path="/home" element={<Home />} />
          <Route path="/chat" element={<AgentChat />} />
          <Route path="/directory" element={<SweDirectory />} />
          <Route path="/directory/:id" element={<SweDirectory />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
