import { useState } from 'react';
import type { WeightEntry } from './lib/types';

import { useAuth } from './hooks/useAuth';
import { useWeightData } from './hooks/useWeightData';
import { useWeightCalculations } from './hooks/useWeightCalculations';
import { useChartDrag } from './hooks/useChartDrag';
import { useContainerWidth } from './hooks/useContainerWidth';
import { useAdvice } from './hooks/useAdvice';

import { LoadingScreen } from './components/LoadingScreen';
import { LoginScreen } from './components/LoginScreen';
import { AppHeader } from './components/AppHeader';
import { StatCards } from './components/StatCards';
import { AdviceBanner } from './components/AdviceBanner';
import { ChartSection } from './components/ChartSection';
import { LogWeightForm } from './components/LogWeightForm';
import { WeeklyHistory } from './components/WeeklyHistory';
import { SettingsView } from './components/SettingsView';
import { EntryDetailModal } from './components/EntryDetailModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';

export default function App() {
  // --- Core State ---
  const { user, loading, handleGoogleLogin, handleLogout } = useAuth();
  const data = useWeightData(user);

  // --- Chart UI State ---
  const [chartMode, setChartMode] = useState<'weekly' | 'daily'>('weekly');
  const [filterRange, setFilterRange] = useState<'1M' | '3M' | 'ALL'>('3M');
  const [showExplanation, setShowExplanation] = useState(false);
  const [expandedWeeks, setExpandedWeeks] = useState<string[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<WeightEntry | null>(null);
  const [adviceSkippedToday, setAdviceSkippedToday] = useState(false);

  // --- Derived Calculations ---
  const { weeklyData, trendMap, currentTrendRate, projectionData, allChartData, finalChartData } =
    useWeightCalculations(data.weights, data.settings, chartMode, filterRange);

  // --- Chart Drag ---
  const { chartHeight, handleDragStart, toggleExpand } = useChartDrag();
  const { containerRef, containerWidth } = useContainerWidth([data.view, loading]);

  // --- Advice ---
  const { advice, showPreWeightPrompt } = useAdvice(
    data.settings, weeklyData, data.weights, currentTrendRate, data.dismissedAdviceWeeks, adviceSkippedToday
  );

  // --- Handlers ---
  const toggleWeek = (weekId: string) => {
    setExpandedWeeks(prev =>
      prev.includes(weekId) ? prev.filter(id => id !== weekId) : [...prev, weekId]
    );
  };

  // --- Routing ---
  if (loading) return <LoadingScreen />;
  if (!user) return <LoginScreen onLogin={handleGoogleLogin} />;

  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-slate-950 text-slate-100 font-sans flex flex-col overflow-hidden overscroll-none">
      <AppHeader
        view={data.view}
        onToggleView={() => data.handleNavigation(data.view === 'settings' ? 'dashboard' : 'settings')}
        onLogout={handleLogout}
      />

      <div className="flex-1 overflow-y-auto w-full relative">
        <div className={`max-w-md mx-auto p-4 ${data.view === 'settings' ? 'h-full flex flex-col' : 'space-y-5'}`}>

          {data.view === 'dashboard' && (
            <>
              <StatCards weeklyData={weeklyData} currentTrendRate={currentTrendRate} settings={data.settings} />

              <AdviceBanner
                showPreWeightPrompt={showPreWeightPrompt}
                advice={advice}
                onSkip={() => setAdviceSkippedToday(true)}
                onDismiss={data.handleDismissAdvice}
              />

              <ChartSection
                finalChartData={finalChartData}
                allChartData={allChartData}
                chartMode={chartMode}
                setChartMode={setChartMode}
                filterRange={filterRange}
                setFilterRange={setFilterRange}
                chartHeight={chartHeight}
                containerWidth={containerWidth}
                containerRef={containerRef}
                settings={data.settings}
                projectionData={projectionData}
                showExplanation={showExplanation}
                setShowExplanation={setShowExplanation}
                handleDragStart={handleDragStart}
                toggleExpand={toggleExpand}
                onSelectEntry={setSelectedEntry}
              />

              <LogWeightForm
                weightInput={data.weightInput}
                setWeightInput={data.setWeightInput}
                dateInput={data.dateInput}
                setDateInput={data.setDateInput}
                commentInput={data.commentInput}
                setCommentInput={data.setCommentInput}
                onSubmit={data.handleAddWeight}
              />

              <WeeklyHistory
                weeklyData={weeklyData}
                settings={data.settings}
                expandedWeeks={expandedWeeks}
                onToggleWeek={toggleWeek}
                onExportCsv={() => data.handleExportCsv(weeklyData, trendMap)}
                onSelectEntry={setSelectedEntry}
                onDeleteEntry={data.setDeleteConfirmationId}
              />
            </>
          )}

          {data.view === 'settings' && (
            <SettingsView
              goalType={data.goalType}
              setGoalType={data.setGoalType}
              weeklyRate={data.weeklyRate}
              monthlyRate={data.monthlyRate}
              dailyCalories={data.dailyCalories}
              setDailyCalories={data.setDailyCalories}
              onRateChange={data.handleRateChange}
              onSave={data.handleSaveSettings}
              onBack={() => data.handleNavigation('dashboard')}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {selectedEntry && (
        <EntryDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}

      {data.deleteConfirmationId && (
        <DeleteConfirmModal
          onConfirm={data.handleDeleteEntry}
          onCancel={() => data.setDeleteConfirmationId(null)}
        />
      )}
    </div>
  );
}