import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SavedPrompt, SavedPromptImage, SavedPromptSettings, PromptFolder } from '../types/prompt-library';
import {
  getAllFolders, createFolder, renameFolder, deleteFolder,
  getAllPrompts, getPromptsByFolder, savePrompt,
  deletePrompt, toggleFavorite, incrementUsedCount, updatePrompt,
} from '../services/prompt-library-db';
import PromptLibraryCard from './prompt-library-card';

// ─── Constants ───────────────────────────────────────────────────────

const EXPANDED_WIDTH = 280;
const COLLAPSED_WIDTH = 40;
const LS_EXPANDED = 'prompt_library_expanded';
const LS_FOLDER = 'prompt_library_selected_folder';
const ALL_FOLDER_ID = '__all__';
const FAVORITES_ID = 'favorites';

// ─── Props ───────────────────────────────────────────────────────────

interface PromptLibraryPanelProps {
  onLoadPrompt: (prompt: SavedPrompt) => void;
  currentPrompt?: string;
  currentNegativePrompt?: string;
  currentReferenceImages?: SavedPromptImage[];
  currentSettings?: SavedPromptSettings;
}

// ─── Component ───────────────────────────────────────────────────────

const PromptLibraryPanel: React.FC<PromptLibraryPanelProps> = ({
  onLoadPrompt,
  currentPrompt,
  currentNegativePrompt,
  currentReferenceImages,
  currentSettings,
}) => {
  // Expand/collapse
  const [expanded, setExpanded] = useState(() =>
    localStorage.getItem(LS_EXPANDED) !== 'false'
  );

  // Data
  const [folders, setFolders] = useState<PromptFolder[]>([]);
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState(() =>
    localStorage.getItem(LS_FOLDER) || FAVORITES_ID
  );

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [dropHighlight, setDropHighlight] = useState(false);

  // Inline prompt editing
  const [editText, setEditText] = useState('');
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null); // null = new prompt

  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Persist expanded/folder to localStorage
  useEffect(() => { localStorage.setItem(LS_EXPANDED, String(expanded)); }, [expanded]);
  useEffect(() => { localStorage.setItem(LS_FOLDER, selectedFolderId); }, [selectedFolderId]);

  // Load folders on mount
  useEffect(() => {
    getAllFolders().then(setFolders);
  }, []);

  // Load prompts when folder changes
  const loadPrompts = useCallback(async () => {
    const data = selectedFolderId === ALL_FOLDER_ID
      ? await getAllPrompts()
      : selectedFolderId === FAVORITES_ID
        ? (await getAllPrompts()).filter(p => p.isFavorite)
        : await getPromptsByFolder(selectedFolderId);
    setPrompts(data);
  }, [selectedFolderId]);

  useEffect(() => { loadPrompts(); }, [loadPrompts]);

  // Focus inputs
  useEffect(() => {
    if (showNewFolder) newFolderInputRef.current?.focus();
  }, [showNewFolder]);
  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  // ─── Folder Handlers ───────────────────────────────────────────────

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    await createFolder(name);
    setNewFolderName('');
    setShowNewFolder(false);
    setFolders(await getAllFolders());
  };

  const handleRenameFolder = async () => {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return; }
    await renameFolder(renamingId, renameValue.trim());
    setRenamingId(null);
    setFolders(await getAllFolders());
  };

  const handleDeleteFolder = async (id: string) => {
    if (id === FAVORITES_ID) return;
    await deleteFolder(id);
    if (selectedFolderId === id) setSelectedFolderId(FAVORITES_ID);
    setFolders(await getAllFolders());
    loadPrompts();
  };

  // ─── Prompt Handlers ──────────────────────────────────────────────

  const handleDeletePrompt = async (id: string) => {
    await deletePrompt(id);
    if (selectedPromptId === id) { setSelectedPromptId(null); setEditingPromptId(null); setEditText(''); }
    loadPrompts();
  };

  const handleToggleFavorite = async (id: string) => {
    await toggleFavorite(id);
    loadPrompts();
  };

  const handleLoadPrompt = (prompt: SavedPrompt) => {
    setSelectedPromptId(prompt.id);
    incrementUsedCount(prompt.id);
    onLoadPrompt(prompt);
  };

  // Click card to select & show in editor for editing
  const handleSelectForEdit = (prompt: SavedPrompt) => {
    setSelectedPromptId(prompt.id);
    setEditingPromptId(prompt.id);
    setEditText(prompt.prompt);
  };

  const handleCopyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Save inline-typed prompt (new or edit existing)
  const handleSaveInlinePrompt = async () => {
    const text = editText.trim();
    if (!text) return;
    const targetFolder = selectedFolderId === ALL_FOLDER_ID ? FAVORITES_ID : selectedFolderId;
    const now = Date.now();

    if (editingPromptId) {
      // Update existing prompt text
      const existing = prompts.find(p => p.id === editingPromptId);
      if (existing) {
        await updatePrompt({ ...existing, prompt: text, updatedAt: now });
      }
    } else {
      // Create new prompt
      const newPrompt: SavedPrompt = {
        id: crypto.randomUUID(),
        folderId: targetFolder,
        prompt: text,
        referenceImages: [],
        isFavorite: targetFolder === FAVORITES_ID,
        usedCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      await savePrompt(newPrompt);
    }

    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 1500);
    setEditText('');
    setEditingPromptId(null);
    loadPrompts();
  };

  // Save current prompt from left panel
  const handleSaveCurrent = async () => {
    if (!currentPrompt?.trim()) return;
    const targetFolder = selectedFolderId === ALL_FOLDER_ID ? FAVORITES_ID : selectedFolderId;
    const now = Date.now();
    const newPrompt: SavedPrompt = {
      id: crypto.randomUUID(),
      folderId: targetFolder,
      prompt: currentPrompt,
      negativePrompt: currentNegativePrompt,
      referenceImages: currentReferenceImages || [],
      settings: currentSettings,
      isFavorite: targetFolder === FAVORITES_ID,
      usedCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await savePrompt(newPrompt);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 1500);
    loadPrompts();
  };

  // Drop zone: accept images dragged from gallery
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropHighlight(false);
    if (!selectedPromptId) return;

    try {
      const json = e.dataTransfer.getData('application/json');
      if (!json) return;
      const img = JSON.parse(json) as { id: string; base64: string; mimeType: string };
      if (!img.base64 || !img.mimeType) return;

      const target = prompts.find(p => p.id === selectedPromptId);
      if (!target) return;

      const updated: SavedPrompt = {
        ...target,
        referenceImages: [...target.referenceImages, { id: img.id || crypto.randomUUID(), base64: img.base64, mimeType: img.mimeType }],
        updatedAt: Date.now(),
      };
      await updatePrompt(updated);
      loadPrompts();
    } catch { /* ignore invalid drag data */ }
  };

  // Filtered prompts
  const filtered = searchQuery.trim()
    ? prompts.filter(p => p.prompt.toLowerCase().includes(searchQuery.toLowerCase()))
    : prompts;

  // ─── Collapsed view ────────────────────────────────────────────────

  if (!expanded) {
    return (
      <div
        className="flex-shrink-0 bg-gray-950 border-r border-gray-800 cursor-pointer flex items-center justify-center hover:bg-gray-900 transition-colors"
        style={{ width: COLLAPSED_WIDTH }}
        onClick={() => setExpanded(true)}
        title="Open Prompt Library"
      >
        <span className="text-gray-500 text-lg" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
          Prompts
        </span>
      </div>
    );
  }

  // ─── Expanded view ─────────────────────────────────────────────────

  return (
    <div
      className="flex-shrink-0 bg-gray-950 border-r border-gray-800 flex flex-col overflow-hidden transition-all duration-200"
      style={{ width: EXPANDED_WIDTH }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="text-sm font-medium text-gray-300">Prompt Library</span>
        <button
          onClick={() => setExpanded(false)}
          className="text-gray-500 hover:text-gray-300 p-1 rounded transition-colors"
          title="Collapse"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search prompts..."
          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-500"
        />
      </div>

      {/* Folder list */}
      <div className="px-2 border-b border-gray-800 pb-2 space-y-0.5">
        <FolderRow label="Favorites" icon="star" active={selectedFolderId === FAVORITES_ID} onClick={() => setSelectedFolderId(FAVORITES_ID)} />
        <FolderRow label="All" icon="list" active={selectedFolderId === ALL_FOLDER_ID} onClick={() => setSelectedFolderId(ALL_FOLDER_ID)} />

        {folders.filter(f => f.id !== FAVORITES_ID).map(f => (
          <div key={f.id}>
            {renamingId === f.id ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={handleRenameFolder}
                onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(); if (e.key === 'Escape') setRenamingId(null); }}
                className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-0.5 text-xs text-gray-300 focus:outline-none"
              />
            ) : (
              <FolderRow
                label={f.name}
                icon="folder"
                active={selectedFolderId === f.id}
                onClick={() => setSelectedFolderId(f.id)}
                onRename={() => { setRenamingId(f.id); setRenameValue(f.name); }}
                onDelete={() => handleDeleteFolder(f.id)}
              />
            )}
          </div>
        ))}

        {showNewFolder ? (
          <div className="flex items-center gap-1 mt-1">
            <input
              ref={newFolderInputRef}
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
              placeholder="Folder name"
              className="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-0.5 text-xs text-gray-300 focus:outline-none"
            />
            <button onClick={handleCreateFolder} className="text-green-400 hover:text-green-300 text-xs px-1">+</button>
            <button onClick={() => setShowNewFolder(false)} className="text-gray-500 hover:text-gray-400 text-xs px-1">x</button>
          </div>
        ) : (
          <button onClick={() => setShowNewFolder(true)} className="w-full text-left text-xs text-gray-600 hover:text-gray-400 px-2 py-0.5 transition-colors">
            + New Folder
          </button>
        )}
      </div>

      {/* Prompt list (scrollable middle section) */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2 min-h-0">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-4">No saved prompts</p>
        ) : (
          filtered.map(p => (
            <PromptLibraryCard
              key={p.id}
              prompt={p}
              isSelected={selectedPromptId === p.id}
              onLoad={() => handleLoadPrompt(p)}
              onSelect={() => handleSelectForEdit(p)}
              onDelete={() => handleDeletePrompt(p.id)}
              onToggleFavorite={() => handleToggleFavorite(p.id)}
              onCopy={() => handleCopyPrompt(p.prompt)}
            />
          ))
        )}
      </div>

      {/* Drop zone for attaching images — large and prominent */}
      <div
        className={`mx-2 mb-2 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-center transition-colors ${
          dropHighlight
            ? 'border-dash-400 bg-dash-900/30 text-dash-300'
            : selectedPromptId
              ? 'border-gray-600 text-gray-500 hover:border-gray-500'
              : 'border-gray-800 text-gray-700'
        }`}
        style={{ minHeight: 80 }}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropHighlight(true); }}
        onDragLeave={() => setDropHighlight(false)}
        onDrop={handleDrop}
      >
        <svg className="w-5 h-5 mb-1 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
        </svg>
        <span className="text-xs">
          {selectedPromptId ? 'Drop images here to attach' : 'Select a prompt first'}
        </span>
      </div>

      {/* Inline prompt editor + save actions */}
      <div className="px-2 pb-2 space-y-1.5 border-t border-gray-800 pt-2">
        <textarea
          value={editText}
          onChange={e => setEditText(e.target.value)}
          placeholder={editingPromptId ? 'Edit prompt...' : 'Type a new prompt...'}
          rows={3}
          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-500 resize-none"
        />
        <div className="flex gap-1.5">
          {/* Save inline (new or update) */}
          <button
            disabled={!editText.trim()}
            onClick={handleSaveInlinePrompt}
            className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
              saveStatus === 'saved'
                ? 'bg-green-700 text-white'
                : editText.trim()
                  ? 'bg-dash-700 hover:bg-dash-600 text-white'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
            }`}
          >
            {saveStatus === 'saved' ? 'Saved!' : editingPromptId ? 'Update' : 'Save New'}
          </button>
          {/* Save current from left panel */}
          {currentPrompt?.trim() && !editingPromptId && (
            <button
              onClick={handleSaveCurrent}
              className="flex-1 py-1.5 rounded text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
              title="Save the active prompt from the left panel"
            >
              Save Current
            </button>
          )}
          {/* Cancel edit */}
          {editingPromptId && (
            <button
              onClick={() => { setEditingPromptId(null); setEditText(''); }}
              className="px-2 py-1.5 rounded text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── FolderRow sub-component ─────────────────────────────────────────

const FolderRow: React.FC<{
  label: string;
  icon: 'star' | 'list' | 'folder';
  active: boolean;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}> = ({ label, icon, active, onClick, onRename, onDelete }) => {
  const iconMap = { star: '★', list: '☰', folder: '📂' };

  return (
    <div
      className={`group flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs transition-colors ${
        active ? 'bg-dash-900/30 text-dash-300 border-l-2 border-dash-500' : 'text-gray-400 hover:bg-gray-900 hover:text-gray-300'
      }`}
      onClick={onClick}
    >
      <span className="text-[10px]">{iconMap[icon]}</span>
      <span className="flex-1 truncate">{label}</span>
      {onRename && (
        <button
          onClick={e => { e.stopPropagation(); onRename(); }}
          className="hidden group-hover:inline-block text-gray-600 hover:text-gray-400 text-[10px] px-0.5"
          title="Rename"
        >
          ✎
        </button>
      )}
      {onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="hidden group-hover:inline-block text-gray-600 hover:text-red-400 text-[10px] px-0.5"
          title="Delete"
        >
          ✕
        </button>
      )}
    </div>
  );
};

export default PromptLibraryPanel;
