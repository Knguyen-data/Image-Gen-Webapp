/**
 * User Management Page
 * Manage users, view details, and perform actions
 */

import React from 'react';
import AdminLayout from '../components/layout/AdminLayout';

export const UserManagement: React.FC = () => {
  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">User Management</h1>
        <p className="text-gray-400 mt-1">Manage users and their accounts</p>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
        <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Coming Soon</h2>
        <p className="text-gray-400 max-w-md mx-auto">
          User management features are being implemented. You'll be able to view users, 
          manage accounts, and perform administrative actions here.
        </p>
      </div>
    </AdminLayout>
  );
};

export default UserManagement;
