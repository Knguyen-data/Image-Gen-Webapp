import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Tracks which items are visible using IntersectionObserver.
 * Returns a Set of visible indices and a ref callback for each item container.
 */
export const useVisibleItems = (totalItems: number, rootMargin = '200px') => {
  const [visibleIndices, setVisibleIndices] = useState<Set<number>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const itemRefs = useRef<Map<number, Element>>(new Map());

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisibleIndices(prev => {
          const next = new Set(prev);
          entries.forEach(entry => {
            const idx = Number(entry.target.getAttribute('data-virt-idx'));
            if (!isNaN(idx)) {
              if (entry.isIntersecting) next.add(idx);
              else next.delete(idx);
            }
          });
          return next;
        });
      },
      { rootMargin }
    );

    itemRefs.current.forEach(el => observerRef.current?.observe(el));

    return () => observerRef.current?.disconnect();
  }, [rootMargin, totalItems]);

  const setItemRef = useCallback((index: number, el: HTMLDivElement | null) => {
    const observer = observerRef.current;
    const prevEl = itemRefs.current.get(index);

    if (prevEl && observer) observer.unobserve(prevEl);

    if (el) {
      el.setAttribute('data-virt-idx', String(index));
      itemRefs.current.set(index, el);
      if (observer) observer.observe(el);
    } else {
      itemRefs.current.delete(index);
    }
  }, []);

  return { visibleIndices, setItemRef };
};
