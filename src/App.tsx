import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './app/AppShell.tsx'
import { HistoryScreen } from './features/history/HistoryScreen.tsx'
import { CheckInScreen } from './features/checkin/CheckInScreen.tsx'
import { RoutineSettingsScreen } from './features/checkin/RoutineSettingsScreen.tsx'
import { HomeScreen } from './features/home/HomeScreen.tsx'
import { SettingsScreen } from './features/settings/SettingsScreen.tsx'
import { SyncSpikeScreen } from './features/sync-spike/SyncSpikeScreen.tsx'
import {
  AddTrackableScreen,
  ArchivedTrackablesScreen,
  CategoriesScreen,
  CustomTrackableScreen,
  EditTrackableScreen,
  ManageTrackablesScreen,
  StarterPacksScreen,
  TrackableLibraryScreen,
  TrackablesScreen,
} from './features/trackables/TrackablesScreen.tsx'
import { TrendsScreen } from './features/trends/TrendsScreen.tsx'
import { EventEditorScreen, LogEventScreen, ManageEventsScreen, QuickLogScreen } from './features/events/EventScreens.tsx'

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomeScreen />} />
        <Route path="check-in" element={<CheckInScreen />} />
        <Route path="events" element={<QuickLogScreen />} />
        <Route path="events/log/:eventDefinitionId" element={<LogEventScreen />} />
        <Route path="events/manage" element={<ManageEventsScreen />} />
        <Route path="events/manage/new" element={<EventEditorScreen />} />
        <Route path="events/manage/:eventDefinitionId" element={<EventEditorScreen />} />
        <Route path="trends" element={<TrendsScreen />} />
        <Route path="history" element={<HistoryScreen />} />
        <Route path="trackables" element={<TrackablesScreen />} />
        <Route path="trackables/add" element={<AddTrackableScreen />} />
        <Route path="trackables/library" element={<TrackableLibraryScreen />} />
        <Route path="trackables/presets" element={<Navigate to="/trackables/library" replace />} />
        <Route path="trackables/packs" element={<StarterPacksScreen />} />
        <Route path="trackables/custom" element={<CustomTrackableScreen />} />
        <Route path="trackables/edit/:trackableId" element={<EditTrackableScreen />} />
        <Route path="trackables/manage" element={<ManageTrackablesScreen />} />
        <Route path="trackables/manage/categories" element={<CategoriesScreen />} />
        <Route path="trackables/manage/archived" element={<ArchivedTrackablesScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="settings/nightly-check-in" element={<RoutineSettingsScreen />} />
        <Route path="sync-spike" element={<SyncSpikeScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
