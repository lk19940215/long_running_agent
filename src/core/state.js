'use strict';

const { assets } = require('../common/assets');
const { getFeatures } = require('../common/tasks');
const { TASK_STATUSES } = require('../common/constants');

// ─── Harness State (harness_state.json) ───────────────────

const DEFAULT_STATE = Object.freeze({
  version: 1,
  next_task_id: 1,
  next_priority: 1,
  session_count: 0,
  last_simplify_session: 0,
  current_task_id: null,
});

function loadState() {
  return assets.readJson('harnessState', { ...DEFAULT_STATE });
}

function saveState(data) {
  assets.writeJson('harnessState', data);
}

function extractIdNum(id) {
  const m = String(id).match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

function syncAfterPlan() {
  const state = loadState();
  const tasks = assets.readJson('tasks', null);
  if (!tasks || !tasks.features) return state;

  const features = tasks.features;
  state.next_task_id = features.reduce((max, f) => Math.max(max, extractIdNum(f.id)), 0) + 1;
  state.next_priority = features.reduce((max, f) => Math.max(max, f.priority || 0), 0) + 1;
  saveState(state);
  return state;
}

// ─── Task Scheduling ──────────────────────────────────────

function selectNextTask(taskData) {
  const features = getFeatures(taskData);

  const failed = features.filter(f => f.status === 'failed')
    .sort((a, b) => (a.priority || 999) - (b.priority || 999));
  if (failed.length > 0) return failed[0];

  const pending = features.filter(f => f.status === 'pending')
    .filter(f => {
      const deps = f.depends_on || [];
      return deps.every(depId => {
        const dep = features.find(x => x.id === depId);
        return dep && dep.status === 'done';
      });
    })
    .sort((a, b) => (a.priority || 999) - (b.priority || 999));
  if (pending.length > 0) return pending[0];

  const inProgress = features.filter(f => f.status === 'in_progress')
    .sort((a, b) => (a.priority || 999) - (b.priority || 999));
  return inProgress[0] || null;
}

function isAllDone(taskData) {
  const features = getFeatures(taskData);
  return features.length > 0 && features.every(f => f.status === 'done');
}

// ─── Progress & Counters ──────────────────────────────────

function appendProgress(entry) {
  let progress = assets.readJson('progress', { sessions: [] });
  if (!Array.isArray(progress.sessions)) progress.sessions = [];
  progress.sessions.push(entry);
  assets.writeJson('progress', progress);
}

function incrementSession() {
  const state = loadState();
  state.session_count++;
  saveState(state);
}

function markSimplifyDone() {
  const state = loadState();
  state.last_simplify_session = state.session_count;
  saveState(state);
}

module.exports = {
  DEFAULT_STATE,
  loadState,
  saveState,
  syncAfterPlan,
  selectNextTask,
  isAllDone,
  appendProgress,
  incrementSession,
  markSimplifyDone,
  TASK_STATUSES,
};
