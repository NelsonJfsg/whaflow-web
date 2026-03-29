import { NgClass } from '@angular/common';
import { Component, Input, WritableSignal, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SidebarItem } from '../sidebar-item/sidebar-item';
import { NavItem } from '../../interfaces/nav-item.interface';
import { AuthService } from '../../../../../features/auth/services/auth.service';
import { environment } from '../../../../../../environments/environment';

@Component({
  selector: 'ui-sidebar',
  imports: [
    MatIconModule,
    MatButtonModule,
    NgClass,
    SidebarItem
],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar { 
  private readonly authService = inject(AuthService);
  protected readonly platformVersion = environment.appVersion.startsWith('v')
    ? environment.appVersion
    : `v${environment.appVersion}`;

  public navItems : NavItem[] = [
    {
      id : 1,
      title : 'Dashboard',
      iconName : 'dashboard',
      routeLink : 'dashboard'
    },
    {
      id : 2,
      title : 'Tareas programadas',
      iconName : 'task',
      routeLink : 'tasks'
    },
    // {
    //   id : 2,
    //   title : 'Security',
    //   iconName : 'security',
    //   routeLink : 'security'
    // },
    // {
    //   id : 3,
    //   title : 'Wallet',
    //   iconName : 'wallet',
    //   routeLink : 'wallet'
    // }
  ];

  public navFootersItems : NavItem[] = [
    {
      id : 4,
      title : 'Salir',
      iconName : 'logout',
      routeLink : 'auth',
      action : () => {
        this.authService.logout();
      }
    },
    {
      id : 5,
      title : 'Configuración',
      iconName : 'settings',
      routeLink : 'settings'
    }
  ];


  @Input() collapsedSignal !: WritableSignal<boolean>;

  public onHandleCollapse () : void {
    this.collapsedSignal.update(v => !v)
  }
  
}
