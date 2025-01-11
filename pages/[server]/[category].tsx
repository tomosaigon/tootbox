import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';
import PostList from '../../components/PostList';
import { getServerBySlug, servers } from '../../config/servers';
import Link from 'next/link';
import { Toaster, toast, ToastOptions, ToastPosition } from 'react-hot-toast';
import NavigationBar from '../../components/NavigationBar';
import { getCategoryBySlug } from '../../db/categories';


const toastOptions: ToastOptions = {
  duration: 2000,
  position: 'bottom-right' as ToastPosition,
  style: {
    cursor: 'pointer'
  },
};

interface TimelineResponse {
  buckets: Record<string, any[]>;
  counts: Record<string, number>;
}

const POSTS_PER_PAGE = 25;

export default function CategoryPage() {
  const router = useRouter();
  const { server, category } = router.query;
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [counts, setCounts] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [showSpam, setShowSpam] = useState(true);
  const [showBitter, setShowBitter] = useState(true);
  const [showPhlog, setShowPhlog] = useState(true);
  const [highlightThreshold, setHighlightThreshold] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [destroying, setDestroying] = useState(false);
  const latestFetchId = useRef(0);

  const toggleShowSpam = () => setShowSpam(prev => !prev);
  const toggleShowBitter = () => setShowBitter(prev => !prev);
  const toggleShowPhlog = () => setShowPhlog(prev => !prev);

  // XXX if (!server || !category) return; 
  const { bucket, label: bucketLabel } = getCategoryBySlug((category ? category : 'regular') as string);
  const serverConfig = server ? getServerBySlug(server as string) : servers[0];

  useEffect(() => {
    if (!server || !category) return;
    refreshPosts();
  }, [server, category, showSpam, showBitter, showPhlog]);

  const refreshPosts = async () => {
    const fetchId = ++latestFetchId.current;

    setLoading(true);
    setPosts([]);
    
    try {
      // Get posts with category
      const postsRes = await fetch(`/api/timeline?server=${server}&category=${bucket}&offset=0&limit=${POSTS_PER_PAGE}`);
      const postsData: TimelineResponse = await postsRes.json();
      const categoryPosts = postsData.buckets[bucket] || [];
      
      // Get updated counts
      const countsRes = await fetch(`/api/timeline?server=${server}&onlyCounts=true`);
      const countsData = await countsRes.json();

      if (fetchId !== latestFetchId.current) return;
      
      setTotalCount(countsData.counts[bucket] || 0);
      setHasMore(categoryPosts.length < countsData.counts[bucket]);
      setCounts(countsData.counts);

      setPosts(categoryPosts);
    } catch (err) {
      console.error(err);
    } finally {
      if (fetchId === latestFetchId.current) {
        setLoading(false);
      }
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/timeline?server=${server}&category=${bucket}&offset=${posts.length}&limit=${POSTS_PER_PAGE}`
      );
      const data: TimelineResponse = await res.json();
      const newPosts = data.buckets[bucket] || [];

      setHasMore(posts.length + newPosts.length < totalCount);

      setPosts(prev => [...prev, ...newPosts]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleServerChange = (newServer: string) => {
    router.push(`/${newServer}/${category}`);
  };

  // Load newer/older handlers
  const handleLoadNewer = async () => {
    const fetchId = ++latestFetchId.current;

    setLoadingNewer(true);
    try {
      const syncRes = await fetch(`/api/timeline-sync?server=${server}`, { method: 'POST' });
      const syncData = await syncRes.json();
      
      if (syncData.newPosts > 0) {
        toast.success(`Loaded ${syncData.newPosts} newer posts`, toastOptions);
        if (fetchId !== latestFetchId.current) return;
        refreshPosts(); // Reload posts if new content
      } else {
        toast('No new posts found', toastOptions);
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to load newer posts', toastOptions);
    } finally {
      setLoadingNewer(false);
    }
  };

  const handleLoadNewer5x = async () => {
    const fetchId = ++latestFetchId.current;
  
    setLoadingNewer(true);
    try {
      let totalNewPosts = 0;
  
      for (let i = 0; i < 5; i++) {
        const syncRes = await fetch(`/api/timeline-sync?server=${server}`, { method: 'POST' });
        const syncData = await syncRes.json();
  
        if (syncData.newPosts > 0) {
          totalNewPosts += syncData.newPosts;
          toast.success(`Batch ${i + 1}: Loaded ${syncData.newPosts} newer posts`, toastOptions);
  
          // if (fetchId !== latestFetchId.current) return;
          // refreshPosts();
        } else {
          toast(`Batch ${i + 1}: No new posts found`, toastOptions);
          break; // Stop if no new posts in the current batch
        }
  
        // Stop the loop if fewer than the limit were returned
        if (syncData.newPosts < 40) {
          toast(`Stopped after batch ${i + 1} as fewer than 40 posts were returned`, toastOptions);
          break;
        }
      }
  
      if (totalNewPosts > 0) {
        toast.success(`Loaded a total of ${totalNewPosts} newer posts`, toastOptions);
        if (fetchId !== latestFetchId.current) return;
        refreshPosts();
      } else {
        toast('No new posts found after 5x', toastOptions);
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to load newer posts in 5x mode', toastOptions);
    } finally {
      setLoadingNewer(false);
    }
  };

  const handleLoadOlder = async () => {
    setLoadingOlder(true);
    try {
      const syncRes = await fetch(`/api/timeline-sync?server=${server}&older=true`, { method: 'POST' });
      const syncData = await syncRes.json();
      
      if (syncData.newPosts > 0) {
        toast.success(`Loaded ${syncData.newPosts} older posts`, toastOptions);
        // refreshPosts(); // DONT Reload posts automatically
      } else {
        toast('No older posts found', toastOptions);
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to load older posts', toastOptions);
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete all posts?')) {
      return;
    }
    
    setDeleting(true);
    try {
      const deleteRes = await fetch(`/api/timeline-sync?server=${server}&delete=true`, {
        method: 'POST'
      });
      
      if (!deleteRes.ok) {
        throw new Error(`Delete failed: ${deleteRes.statusText}`);
      }
      
      // Only refresh counts after successful deletion
      const res = await fetch(`/api/timeline?server=${server}&onlyCounts=true`);
      if (!res.ok) {
        throw new Error(`Failed to fetch counts: ${res.statusText}`);
      }
      
      const data = await res.json();
      setCounts(data.counts);
    } catch (error) {
      console.error(error);
      if (error instanceof Error) {
        alert('Failed to delete posts: ' + error.message);
      } else {
        alert('Failed to delete posts: An unknown error occurred.');
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleDestroy = async () => {
    if (!confirm('Are you sure you want to destroy the database? This will delete ALL posts from ALL servers.')) {
      return;
    }
    
    setDestroying(true);
    try {
      const destroyRes = await fetch(`/api/timeline-sync?delete=true`, {
        method: 'POST'
      });

      if (!destroyRes.ok) {
        throw new Error(`Destroy failed: ${destroyRes.statusText}`);
      }
      
      // Only refresh counts after successful destruction
      const res = await fetch(`/api/timeline?server=${server}&onlyCounts=true`);
      if (!res.ok) {
        throw new Error(`Failed to fetch counts: ${res.statusText}`);
      }
      
      const data = await res.json();
      setCounts(data.counts);
    } catch (error) {
      console.error(error);
      if (error instanceof Error) {
        alert('Failed to destroy database: ' + error.message);
      } else {
        alert('Failed to destroy database: An unknown error occurred.');
      }
    } finally {
      setDestroying(false);
    }
  };

  const handleMarkSeen = async () => {
    if (posts.length === 0) {
      toast.error('No posts to mark as seen', toastOptions);
      return;
    }
  
    const fetchId = ++latestFetchId.current;
    const seenFrom = posts[posts.length - 1].created_at; // Oldest post
    const seenTo = posts[0].created_at; // Latest post
  
    try {
      const res = await fetch(`/api/mark-seen?server=${server}&seenFrom=${seenFrom}&seenTo=${seenTo}&bucket=${bucket}`, {
        method: 'POST',
      });
  
      if (!res.ok) {
        throw new Error(`Mark seen failed: ${res.statusText}`);
      }
  
      const data = await res.json();
      toast.success(`Marked ${data.updatedCount} posts as seen`, toastOptions);
  
      if (fetchId !== latestFetchId.current) return;
  
      // Refresh the page to reflect the updated state
      refreshPosts();
    } catch (error) {
      console.error(error);
      toast.error('Failed to mark posts as seen', toastOptions);
    }
  };

  if (!serverConfig) {
    return <div className="p-4">Server not found</div>;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 w-full">
      <NavigationBar
        server={server as string}
        onServerChange={handleServerChange}
        category={category ? category as string : 'regular'}
        counts={counts}
        showSpam={showSpam}
        toggleShowSpam={toggleShowSpam}
        showBitter={showBitter}
        toggleShowBitter={toggleShowBitter}
        showPhlog={showPhlog}
        toggleShowPhlog={toggleShowPhlog}
        highlightThreshold={highlightThreshold}
        setHighlightThreshold={setHighlightThreshold}
        onMarkSeen={handleMarkSeen}
        onLoadNewer={handleLoadNewer}
        onLoadNewer5x={handleLoadNewer5x}
        onLoadOlder={handleLoadOlder}
        onDelete={handleDelete}
        onDestroy={handleDestroy}
        loadingNewer={loadingNewer}
        loadingOlder={loadingOlder}
        deleting={deleting}
        destroying={destroying}
      />
        {/* Main content area - remove padding on mobile */}
        <div className="p-0 sm:p-8">
          {/* Back link and title */}
          <div className="p-3 sm:p-4">
            <div>
              <Link 
                href={`/?server=${server}`}
                className="text-blue-500 hover:underline"
              >
                ← Back to Categories
              </Link>
              <h1 className="text-2xl font-bold mt-2">
                {bucketLabel} 
                <span className="text-gray-500 text-xl ml-2">
                  ({totalCount} total)
                </span>
              </h1>
              <p className="text-gray-600 text-base">
                From {serverConfig.name}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="p-4">Loading...</div>
          ) : (
            <>
              <PostList 
                posts={posts} 
                showSpam={showSpam} 
                showBitter={showBitter} 
                showPhlog={category === 'with-images' ? showPhlog : true}
                highlightThreshold={highlightThreshold}
              />
                <div className="flex justify-center items-center space-x-4 py-4">
                  <button
                    onClick={handleMarkSeen}
                    className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                  >
                    Mark Seen
                  </button>
                  {hasMore && (
                    <button
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                    >
                      {loadingMore ? 'Loading...' : `Load More (${totalCount - posts.length} remaining)`}
                    </button>
                  )}
                </div>
            </>
          )}
        </div>
      </main>
      <Toaster/>
    </div>
  );
}

