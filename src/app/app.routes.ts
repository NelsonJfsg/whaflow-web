import { Routes } from '@angular/router';
import { MainLayout } from './shared/ui/layout/pages/main-layout/main-layout';
import { AuthGuard } from './core/guards/AuthGuard-guard';
import { NoAuthGuard } from './core/guards/NoAuthGuard-guard';
import { TasksPage } from './features/tasks/pages/TasksPage/TasksPage';

export const routes: Routes = [
  {
    path : 'auth',
    canActivate : [NoAuthGuard],
    loadChildren : () => import('./features/auth/auth.routes').then(r => r.AuthRoutes)
  },
  {
    path : '',
    component : MainLayout,
    canActivate : [AuthGuard],
    children : [
      {
        path : 'dashboard',
        loadChildren : () => import('./features/dashboard/dashboard.routes')
        .then(r => r.DashboardRoutes)
      },
      {
        path : 'tasks',
        component : TasksPage,
        data : {
          title : 'Tareas programadas'
        }
      },
      
      // {
      //   path : 'security',
      //   loadChildren : () => import('./features/security/security.routes')
      //   .then(r => r.SecurityRoutes)
      // },
      // {
      //   path : 'wallet',
      //   loadChildren : () => import('./features/wallet/wallet.routes')
      //   .then(r => r.WalletRoutes)
      // },
      {
        path : 'settings',
        loadChildren : () => import('./features/settings/settings.routes')
        .then(r => r.SettingsRoutes)
      },
      {
        path : '**',
        redirectTo : 'home'
      }
    ]
  },
  {
    path : '**',
    redirectTo : 'auth'
  }
  
];
