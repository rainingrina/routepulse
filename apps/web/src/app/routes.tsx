import { lazy } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { RoleGuard, HomeRedirect } from './RoleGuard';
import { RouteErrorBoundary, NotFoundPage } from './RouteErrorBoundary';
import { AuthLayout, CoordinatorLayout, CustomerLayout, DriverLayout } from './layouts/layouts';
import { PlannedScreen } from './PlannedScreen';

const LoginPage = lazy(() => import('../features/auth/LoginPage'));
const ControlTowerPage = lazy(() => import('../features/control-tower/ControlTowerPage'));

/** Three route trees + login (UI plan §3, architecture §5.1). Each tree has its own error boundary. */
export const routes: RouteObject[] = [
  {
    path: '/login',
    element: <AuthLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [{ index: true, element: <LoginPage /> }],
  },
  { path: '/', element: <HomeRedirect />, errorElement: <RouteErrorBoundary /> },
  {
    element: (
      <RoleGuard role="COORDINATOR">
        <CoordinatorLayout />
      </RoleGuard>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: 'control-tower', element: <ControlTowerPage /> },
      { path: 'shipments/:id', element: <PlannedScreen title="Shipment detail" task="11.3" /> },
      { path: 'shipments/:id/replay', element: <PlannedScreen title="Replay" task="11.6" /> },
      { path: 'dashboard', element: <PlannedScreen title="Dashboard" task="14.2" /> },
      { path: 'reports', element: <PlannedScreen title="Driver reports" task="11.8" /> },
      { path: 'simulation', element: <PlannedScreen title="Simulation" task="11.7" /> },
    ],
  },
  {
    element: (
      <RoleGuard role="CUSTOMER">
        <CustomerLayout />
      </RoleGuard>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: 'orders', element: <PlannedScreen title="Orders" task="12.1" /> },
      { path: 'orders/:id', element: <PlannedScreen title="Order detail" task="12.2" /> },
      { path: 'notifications', element: <PlannedScreen title="Notifications" task="12.3" /> },
    ],
  },
  {
    element: (
      <RoleGuard role="DRIVER">
        <DriverLayout />
      </RoleGuard>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: 'trip', element: <PlannedScreen title="Trip" task="13.1" /> },
      { path: 'trip/report', element: <PlannedScreen title="Report a problem" task="13.2" /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export function createRouter() {
  return createBrowserRouter(routes);
}
