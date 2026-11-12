import { lazy } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { RoleGuard, HomeRedirect } from './RoleGuard';
import { RouteErrorBoundary, NotFoundPage } from './RouteErrorBoundary';
import { AuthLayout, CoordinatorLayout, CustomerLayout, DriverLayout } from './layouts/layouts';

const LoginPage = lazy(() => import('../features/auth/LoginPage'));
const ControlTowerPage = lazy(() => import('../features/control-tower/ControlTowerPage'));
const ShipmentDetailPage = lazy(() => import('../features/shipment/ShipmentDetailPage'));
const SimulationPage = lazy(() => import('../features/simulation/SimulationPage'));
const ReplayPage = lazy(() => import('../features/replay/ReplayPage'));
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'));
const ReportsPage = lazy(() => import('../features/reports/ReportsPage'));
const OrdersPage = lazy(() => import('../features/customer/OrdersPage'));
const OrderDetailPage = lazy(() => import('../features/customer/OrderDetailPage'));
const NotificationsPage = lazy(() => import('../features/customer/NotificationsPage'));
const TripPage = lazy(() => import('../features/driver/TripPage'));
const ReportProblemPage = lazy(() => import('../features/driver/ReportProblemPage'));

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
      { path: 'shipments/:id', element: <ShipmentDetailPage /> },
      { path: 'shipments/:id/replay', element: <ReplayPage /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'simulation', element: <SimulationPage /> },
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
      { path: 'orders', element: <OrdersPage /> },
      { path: 'orders/:id', element: <OrderDetailPage /> },
      { path: 'notifications', element: <NotificationsPage /> },
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
      { path: 'trip', element: <TripPage /> },
      { path: 'trip/report', element: <ReportProblemPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];

export function createRouter() {
  return createBrowserRouter(routes);
}
