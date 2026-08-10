import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './app/AppShell.tsx'
import { HistoryScreen } from './features/history/HistoryScreen.tsx'
import { HomeScreen } from './features/home/HomeScreen.tsx'
import { SettingsScreen } from './features/settings/SettingsScreen.tsx'
import { TrackablesScreen } from './features/trackables/TrackablesScreen.tsx'
import { TrendsScreen } from './features/trends/TrendsScreen.tsx'

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomeScreen />} />
        <Route path="trends" element={<TrendsScreen />} />
        <Route path="history" element={<HistoryScreen />} />
        <Route path="trackables" element={<TrackablesScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
