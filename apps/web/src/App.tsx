import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Bestiary } from "./routes/Bestiary";
import { Changelog } from "./routes/Changelog";
import { CreatureDetail } from "./routes/CreatureDetail";
import { DocumentDetail, DocumentsList } from "./routes/Documents";
import { Elements } from "./routes/Elements";
import { Home } from "./routes/Home";
import { Equipment } from "./routes/Equipment";
import { Items } from "./routes/Items";
import { MapPrototypeChecklist } from "./routes/MapPrototypeChecklist";
import { Maps } from "./routes/Maps";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="/bestiary" element={<Bestiary />} />
          <Route path="/bestiary/:code" element={<CreatureDetail />} />
          <Route path="/items" element={<Items />} />
          <Route path="/equipment" element={<Equipment />} />
          <Route path="/maps" element={<Maps />} />
          <Route path="/maps/prototype-checklist" element={<MapPrototypeChecklist />} />
          <Route path="/elements" element={<Elements />} />
          <Route path="/documents" element={<DocumentsList />} />
          <Route path="/documents/:slug" element={<DocumentDetail />} />
          <Route path="/changelog" element={<Changelog />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
