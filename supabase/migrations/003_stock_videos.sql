-- Stock Videos Search Index
-- Stores metadata about stock videos in GCS bucket higgfails_media

CREATE TABLE IF NOT EXISTS public.stock_videos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  filename text NOT NULL,
  category text NOT NULL,
  url text NOT NULL,
  size bigint DEFAULT 0,
  mime_type text DEFAULT 'video/mp4',
  tags text[] DEFAULT '{}',
  description text DEFAULT '',
  mood text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Unique constraint for upsert (filename + category)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_videos_filename_category 
  ON public.stock_videos (filename, category);

-- Index for category filtering
CREATE INDEX IF NOT EXISTS idx_stock_videos_category 
  ON public.stock_videos (category);

-- Index for sorting
CREATE INDEX IF NOT EXISTS idx_stock_videos_name ON public.stock_videos (name);
CREATE INDEX IF NOT EXISTS idx_stock_videos_size ON public.stock_videos (size);
CREATE INDEX IF NOT EXISTS idx_stock_videos_created_at ON public.stock_videos (created_at);

-- RLS: Allow public read access (anon key can read)
ALTER TABLE public.stock_videos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'stock_videos' AND policyname = 'stock_videos_public_read'
  ) THEN
    CREATE POLICY "stock_videos_public_read" ON public.stock_videos
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'stock_videos' AND policyname = 'stock_videos_service_write'
  ) THEN
    CREATE POLICY "stock_videos_service_write" ON public.stock_videos
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Function for full-text search with category filter
-- Uses runtime tsvector computation (no generated column needed)
CREATE OR REPLACE FUNCTION search_stock_videos(
  search_query text DEFAULT '',
  category_filter text DEFAULT '',
  sort_by text DEFAULT 'name',
  sort_dir text DEFAULT 'asc',
  page_limit int DEFAULT 50,
  page_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  filename text,
  category text,
  url text,
  size bigint,
  mime_type text,
  tags text[],
  description text,
  mood text,
  created_at timestamptz,
  rank real
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sv.id,
    sv.name,
    sv.filename,
    sv.category,
    sv.url,
    sv.size,
    sv.mime_type,
    sv.tags,
    sv.description,
    sv.mood,
    sv.created_at,
    CASE 
      WHEN search_query = '' THEN 0.0::real
      ELSE ts_rank(
        setweight(to_tsvector('simple', coalesce(sv.name, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(sv.description, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(sv.mood, '')), 'C') ||
        setweight(to_tsvector('simple', coalesce(array_to_string(sv.tags, ' '), '')), 'B'),
        plainto_tsquery('simple', search_query)
      )::real
    END as rank
  FROM public.stock_videos sv
  WHERE 
    (category_filter = '' OR sv.category = category_filter)
    AND (
      search_query = '' 
      OR (
        setweight(to_tsvector('simple', coalesce(sv.name, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(sv.description, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(sv.mood, '')), 'C') ||
        setweight(to_tsvector('simple', coalesce(array_to_string(sv.tags, ' '), '')), 'B')
      ) @@ plainto_tsquery('simple', search_query)
      OR sv.name ILIKE '%' || search_query || '%'
      OR sv.category ILIKE '%' || search_query || '%'
    )
  ORDER BY
    CASE WHEN search_query != '' THEN ts_rank(
      setweight(to_tsvector('simple', coalesce(sv.name, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(sv.description, '')), 'B'),
      plainto_tsquery('simple', search_query)
    ) END DESC NULLS LAST,
    CASE WHEN sort_by = 'name' AND sort_dir = 'asc' THEN sv.name END ASC,
    CASE WHEN sort_by = 'name' AND sort_dir = 'desc' THEN sv.name END DESC,
    CASE WHEN sort_by = 'size' AND sort_dir = 'asc' THEN sv.size END ASC,
    CASE WHEN sort_by = 'size' AND sort_dir = 'desc' THEN sv.size END DESC,
    CASE WHEN sort_by = 'date' AND sort_dir = 'asc' THEN sv.created_at END ASC,
    CASE WHEN sort_by = 'date' AND sort_dir = 'desc' THEN sv.created_at END DESC,
    sv.name ASC
  LIMIT page_limit
  OFFSET page_offset;
END;
$$;

-- Function to get category counts
CREATE OR REPLACE FUNCTION get_stock_video_categories()
RETURNS TABLE (
  category text,
  video_count bigint
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT category, count(*) as video_count
  FROM public.stock_videos
  GROUP BY category
  ORDER BY category;
$$;
