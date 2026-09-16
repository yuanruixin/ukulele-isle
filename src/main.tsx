import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
import NavBar from "./components/NavBar";
import HomePage from "./pages/HomePage";
import SongsPage from "./pages/SongsPage";
import ToolsPage from "./pages/ToolsPage";
import TunerPage from "./pages/TunerPage";
import ChordsPage from "./pages/ChordsPage";
import UkulelePage from "./pages/UkulelePage";
import "./styles/globals.css";

// 详情页懒加载：alphaTab 体积大（~1.2MB），只在进入歌曲页时才下载
const SongPage = lazy(() => import("./pages/SongPage"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <NavBar />
      <Suspense
        fallback={
          <p className="text-secondary py-24 text-center text-sm">加载中…</p>
        }
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/songs" element={<SongsPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/tools/tuner" element={<TunerPage />} />
          {/* 和弦库本身很轻（alphaTab 由页面内部动态 import，会切成独立 chunk） */}
          <Route path="/tools/chords" element={<ChordsPage />} />
          {/* 虚拟尤克里里同理：指板是自绘 SVG，alphaTab 与上面几个页面共用同一份 chunk */}
          <Route path="/tools/uke" element={<UkulelePage />} />
          <Route path="/song/:id" element={<SongPage />} />
        </Routes>
      </Suspense>
    </HashRouter>
  </React.StrictMode>
);
