import { useState, useRef, useEffect } from 'react';

interface CompareModalProps {
  videoUrls: string[];
  onClose: () => void;
}

export function CompareModal({ videoUrls, onClose }: CompareModalProps) {
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [mode, setMode] = useState<'grid' | 'ab'>('grid');
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  function playAll() {
    videoRefs.current.forEach(v => v?.play());
    setIsPlaying(true);
  }

  function pauseAll() {
    videoRefs.current.forEach(v => v?.pause());
    setIsPlaying(false);
  }

  function syncSeek(time: number) {
    videoRefs.current.forEach(v => {
      if (v) v.currentTime = time;
    });
  }

  function changeSpeed(speed: number) {
    setPlaybackSpeed(speed);
    videoRefs.current.forEach(v => {
      if (v) v.playbackRate = speed;
    });
  }

  function setRating(index: number, rating: number) {
    setRatings(prev => ({ ...prev, [index]: rating }));
  }

  function setNote(index: number, note: string) {
    setNotes(prev => ({ ...prev, [index]: note }));
  }

  // Sync on master video timeupdate
  useEffect(() => {
    const master = videoRefs.current[0];
    if (!master) return;

    const handleTimeUpdate = () => {
      const time = master.currentTime;
      videoRefs.current.slice(1).forEach(v => {
        if (v && Math.abs(v.currentTime - time) > 0.1) {
          v.currentTime = time;
        }
      });
    };

    master.addEventListener('timeupdate', handleTimeUpdate);
    return () => master.removeEventListener('timeupdate', handleTimeUpdate);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 bg-gray-900 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-white">Compare Videos ({videoUrls.length})</h2>

          <div className="flex gap-2">
            <button
              onClick={() => setMode('grid')}
              className={`px-3 py-1 rounded ${mode === 'grid' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
            >
              Grid
            </button>
            <button
              onClick={() => setMode('ab')}
              disabled={videoUrls.length !== 2}
              className={`px-3 py-1 rounded ${mode === 'ab' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              A/B Slider
            </button>
          </div>
        </div>

        <button onClick={onClose} className="text-white text-2xl hover:text-gray-300">✕</button>
      </div>

      {/* Video Grid or A/B View */}
      {mode === 'ab' && videoUrls.length === 2 ? (
        <ABCompare videoA={videoUrls[0]} videoB={videoUrls[1]} />
      ) : (
        <div className="flex-1 p-4 grid gap-4" style={{
          gridTemplateColumns: videoUrls.length === 2 ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(400px, 1fr))'
        }}>
          {videoUrls.map((url, index) => (
            <div key={index} className="relative bg-black rounded overflow-hidden">
              <video
                ref={el => videoRefs.current[index] = el}
                src={url}
                className="w-full h-full object-contain"
                controls
              />

              {/* Ratings and Notes Overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4">
                <div className="flex gap-1 mb-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setRating(index, star)}
                      className={`text-2xl ${ratings[index] >= star ? 'text-yellow-400' : 'text-gray-500'} hover:text-yellow-300`}
                    >
                      ★
                    </button>
                  ))}
                </div>

                <textarea
                  placeholder="Notes..."
                  value={notes[index] || ''}
                  onChange={e => setNote(index, e.target.value)}
                  className="w-full bg-gray-800 text-white rounded p-2 text-sm resize-none"
                  rows={2}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      {mode === 'grid' && (
        <div className="p-4 bg-gray-900 flex items-center gap-4">
          <button
            onClick={isPlaying ? pauseAll : playAll}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {isPlaying ? '⏸ Pause All' : '▶ Play All'}
          </button>

          <div className="flex items-center gap-2 text-white">
            <label>Speed:</label>
            <select
              value={playbackSpeed}
              onChange={e => changeSpeed(Number(e.target.value))}
              className="bg-gray-800 text-white px-2 py-1 rounded"
            >
              <option value={0.25}>0.25x</option>
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// A/B Compare Component (inline for simplicity)
interface ABCompareProps {
  videoA: string;
  videoB: string;
}

function ABCompare({ videoA, videoB }: ABCompareProps) {
  const [position, setPosition] = useState(50);

  return (
    <div className="relative w-full h-full bg-black">
      {/* Video A (left) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <video src={videoA} className="w-full h-full object-contain" autoPlay loop muted />
      </div>

      {/* Video B (right) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 0 0 ${position}%)` }}
      >
        <video src={videoB} className="w-full h-full object-contain" autoPlay loop muted />
      </div>

      {/* Slider */}
      <input
        type="range"
        min="0"
        max="100"
        value={position}
        onChange={e => setPosition(Number(e.target.value))}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 w-64 z-10"
      />

      {/* Divider Line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white z-10"
        style={{ left: `${position}%` }}
      />
    </div>
  );
}
