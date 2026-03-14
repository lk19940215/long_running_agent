import React, { Suspense } from 'react';
import { createHashRouter, RouterProvider, Link } from 'react-router-dom';
import App from '../App';

const Home = () => import('../pages/Home');
const Features = () => import('../pages/Features');
const QuickStart = () => import('../pages/QuickStart');
const Docs = () => import('../pages/Docs');
const Examples = () => import('../pages/Examples');

const lazyLoad = (loader: () => Promise<{ default: React.ComponentType }>) => {
  const LazyComponent = React.lazy(loader);
  return <LazyComponent />;
};

const PageLoading = () => (
  <div className="min-h-screen flex items-center justify-center bg-[var(--bg-100)]">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary-500)]" />
  </div>
);

const NotFound = () => (
  <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
    <h1 className="text-6xl font-bold bg-gradient-to-r from-[var(--gradient-start)] to-[var(--gradient-end)] bg-clip-text text-transparent mb-4">
      404
    </h1>
    <p className="text-xl text-[var(--text-400)] mb-8">页面未找到</p>
    <Link to="/" className="btn-primary no-underline">返回首页</Link>
  </div>
);

const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<PageLoading />}>
            {lazyLoad(Home)}
          </Suspense>
        ),
      },
      {
        path: 'quick-start',
        element: (
          <Suspense fallback={<PageLoading />}>
            {lazyLoad(QuickStart)}
          </Suspense>
        ),
      },
      {
        path: 'features',
        element: (
          <Suspense fallback={<PageLoading />}>
            {lazyLoad(Features)}
          </Suspense>
        ),
      },
      {
        path: 'docs',
        element: (
          <Suspense fallback={<PageLoading />}>
            {lazyLoad(Docs)}
          </Suspense>
        ),
      },
      {
        path: 'examples',
        element: (
          <Suspense fallback={<PageLoading />}>
            {lazyLoad(Examples)}
          </Suspense>
        ),
      },
      {
        path: '*',
        element: <NotFound />,
      },
    ],
  },
]);

export const Router = () => <RouterProvider router={router} />;

export default router;
