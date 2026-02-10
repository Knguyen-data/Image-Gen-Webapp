interface BatchActionsToolbarProps {
  selectedCount: number;
  onSaveCollection: () => void;
  onCompare: () => void;
  onDownloadZip: () => void;
  onUploadR2: () => void;
  onDeleteAll: () => void;
  onClearSelection: () => void;
}

export function BatchActionsToolbar({
  selectedCount,
  onSaveCollection,
  onCompare,
  onDownloadZip,
  onUploadR2,
  onDeleteAll,
  onClearSelection,
}: BatchActionsToolbarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 p-4 z-40">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-white font-semibold">
            {selectedCount} video{selectedCount !== 1 ? 's' : ''} selected
          </span>

          <button onClick={onClearSelection} className="text-gray-400 hover:text-white">
            Clear
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onSaveCollection}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            💾 Save Collection
          </button>

          <button
            onClick={onCompare}
            disabled={selectedCount < 2}
            className="px-4 py-2 bg-dash-600 text-white rounded hover:bg-dash-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🔍 Compare
          </button>

          <button
            onClick={onDownloadZip}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            ⬇️ Download ZIP
          </button>

          <button
            onClick={onUploadR2}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            ☁️ Upload to R2
          </button>

          <button
            onClick={onDeleteAll}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            🗑️ Delete All
          </button>
        </div>
      </div>
    </div>
  );
}
