'use client';

import { useState } from 'react';
import { Settings, Building2, Sliders, BookOpen, Shield, Users } from 'lucide-react';

const tabs = [
  { id: 'organization', label: 'Organization', icon: Building2 },
  { id: 'defaults', label: 'Review Defaults', icon: Sliders },
  { id: 'rulepacks', label: 'Rule Packs', icon: BookOpen },
  { id: 'authorities', label: 'Authorities', icon: Shield },
  { id: 'users', label: 'Users', icon: Users },
];

const rulePacks = [
  { id: 'osha-hazcom', name: 'OSHA Hazard Communication', domain: 'Occupational Safety', rules: 7, version: '1.0.0', enabled: true },
  { id: 'osha-loto', name: 'OSHA Lockout/Tagout', domain: 'Occupational Safety', rules: 6, version: '1.0.0', enabled: true },
  { id: 'osha-eap', name: 'OSHA Emergency Action Plan', domain: 'Occupational Safety', rules: 5, version: '1.0.0', enabled: true },
  { id: 'osha-resppro', name: 'OSHA Respiratory Protection', domain: 'Occupational Safety', rules: 6, version: '1.0.0', enabled: true },
  { id: 'ashrae-62.1', name: 'ASHRAE 62.1 Nonresidential Ventilation', domain: 'Indoor Air Quality', rules: 9, version: '1.0.0', enabled: true },
  { id: 'ashrae-62.2', name: 'ASHRAE 62.2 Residential Ventilation', domain: 'Indoor Air Quality', rules: 5, version: '1.0.0', enabled: false },
  { id: 'ashrae-55', name: 'ASHRAE 55 Thermal Comfort', domain: 'Indoor Air Quality', rules: 5, version: '1.0.0', enabled: true },
  { id: 'ashrae-241', name: 'ASHRAE 241 Infectious Aerosol Control', domain: 'Indoor Air Quality', rules: 8, version: '1.0.0', enabled: true },
];

const authorities = [
  { name: 'OSHA', status: 'Active', refs: 14, lastUpdated: '2026-03-15' },
  { name: 'ASHRAE', status: 'Active', refs: 7, lastUpdated: '2026-03-20' },
  { name: 'EPA', status: 'Coming Soon', refs: 0, lastUpdated: '-' },
  { name: 'NIOSH', status: 'Coming Soon', refs: 0, lastUpdated: '-' },
  { name: 'AIHA', status: 'Coming Soon', refs: 0, lastUpdated: '-' },
];

const users = [
  { name: 'Tsidi M.', email: 'tsidi@prudenceehs.com', role: 'Admin', status: 'Active', lastActive: '2026-04-09' },
  { name: 'Jordan K.', email: 'jordan@clientcorp.com', role: 'Reviewer', status: 'Active', lastActive: '2026-04-08' },
  { name: 'Alex P.', email: 'alex@clientcorp.com', role: 'Viewer', status: 'Active', lastActive: '2026-04-05' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('organization');
  const [packStates, setPackStates] = useState<Record<string, boolean>>(
    Object.fromEntries(rulePacks.map((p) => [p.id, p.enabled]))
  );

  const togglePack = (id: string) => {
    setPackStates((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-description">Configure your intelligence engine</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Organization */}
      {activeTab === 'organization' && (
        <div className="max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Organization Profile</h2>
          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Organization Name</label>
              <input type="text" defaultValue="Prudence EHS" className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Industry</label>
              <select className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm">
                <option>Manufacturing</option>
                <option>Construction</option>
                <option>Healthcare</option>
                <option>Education</option>
                <option>Commercial Office</option>
                <option>Government</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Number of Sites</label>
              <input type="number" defaultValue={3} className="mt-1 h-10 w-32 rounded-lg border border-gray-200 px-3 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <button className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Review Defaults */}
      {activeTab === 'defaults' && (
        <div className="max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Review Defaults</h2>
          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Default Reading Level</label>
              <select className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm">
                <option>Technical Professional</option>
                <option>Grade 5-6</option>
                <option>Grade 8</option>
                <option>High School</option>
                <option>Executive Concise</option>
                <option>Regulator Formal</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Default Output Mode</label>
              <select className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm">
                <option>Technical Review</option>
                <option>Executive Summary</option>
                <option>Worker Explanation</option>
                <option>Supervisor Guidance</option>
                <option>Regulator Formal</option>
                <option>Redline Suggestion</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Auto-Escalation Threshold</label>
              <p className="text-xs text-gray-500">Findings below this confidence level will be auto-escalated</p>
              <input type="range" min="0" max="100" defaultValue={50} className="mt-2 w-full" />
              <div className="flex justify-between text-xs text-gray-400">
                <span>0.0 (never)</span>
                <span>0.5</span>
                <span>1.0 (always)</span>
              </div>
            </div>
            <button className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Save Defaults
            </button>
          </div>
        </div>
      )}

      {/* Rule Packs */}
      {activeTab === 'rulepacks' && (
        <div className="space-y-3">
          {rulePacks.map((pack) => (
            <div key={pack.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-6 py-4 shadow-sm">
              <div>
                <h3 className="font-medium text-gray-900">{pack.name}</h3>
                <p className="mt-0.5 text-sm text-gray-500">
                  {pack.domain} &middot; {pack.rules} rules &middot; v{pack.version}
                </p>
              </div>
              <button
                onClick={() => togglePack(pack.id)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  packStates[pack.id] ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    packStates[pack.id] ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Authorities */}
      {activeTab === 'authorities' && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">Authority</th>
                <th className="px-6 py-3 font-medium text-gray-500">Status</th>
                <th className="px-6 py-3 font-medium text-gray-500">References</th>
                <th className="px-6 py-3 font-medium text-gray-500">Last Updated</th>
                <th className="px-6 py-3 font-medium text-gray-500">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {authorities.map((auth) => (
                <tr key={auth.name} className="border-b border-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{auth.name}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      auth.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'
                    }`}>
                      {auth.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-600">{auth.refs}</td>
                  <td className="px-6 py-3 text-gray-600">{auth.lastUpdated}</td>
                  <td className="px-6 py-3">
                    <input type="checkbox" defaultChecked={auth.status === 'Active'} disabled={auth.status !== 'Active'} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Users */}
      {activeTab === 'users' && (
        <div>
          <div className="mb-4 flex justify-end">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Invite User
            </button>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-6 py-3 font-medium text-gray-500">Name</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Email</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Role</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Status</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Last Active</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.email} className="border-b border-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{user.name}</td>
                    <td className="px-6 py-3 text-gray-600">{user.email}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.role === 'Admin' ? 'bg-purple-50 text-purple-700' : user.role === 'Reviewer' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-700'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Active</span>
                    </td>
                    <td className="px-6 py-3 text-gray-600">{user.lastActive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
