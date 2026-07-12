import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ConfigViewerPage } from './pages/ConfigViewerPage';
import { ComparePage } from './pages/ComparePage';
import { DevicePage } from './pages/DevicePage';
import { ImportsPage } from './pages/ImportsPage';
import { PathAnalysisPage } from './pages/PathAnalysisPage';
import { SnapshotPage } from './pages/SnapshotPage';
import { SnapshotsPage } from './pages/SnapshotsPage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { WorkspaceLayout } from './pages/WorkspaceLayout';

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<WorkspacesPage />} />
        <Route path="/w/:workspaceId" element={<WorkspaceLayout />}>
          <Route index element={<Navigate to="snapshots" replace />} />
          <Route path="snapshots" element={<SnapshotsPage />} />
          <Route path="imports" element={<ImportsPage />} />
          <Route path="path" element={<PathAnalysisPage />} />
          <Route path="compare" element={<ComparePage />} />
        </Route>
        <Route path="/snapshots/:snapshotId" element={<SnapshotPage />} />
        <Route path="/devices/:deviceId" element={<DevicePage />} />
        <Route path="/devices/:deviceId/config" element={<ConfigViewerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
