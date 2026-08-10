import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Bestiary } from "./routes/Bestiary";
import { Changelog } from "./routes/Changelog";
import { CreatureDetail } from "./routes/CreatureDetail";
import { DocumentDetail, DocumentsList } from "./routes/Documents";
import { Home } from "./routes/Home";
import { Items } from "./routes/Items";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="/bestiary" element={<Bestiary />} />
          <Route path="/bestiary/:code" element={<CreatureDetail />} />
          <Route path="/items" element={<Items />} />
          <Route path="/documents" element={<DocumentsList />} />
          <Route path="/documents/:slug" element={<DocumentDetail />} />
          <Route path="/changelog" element={<Changelog />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
