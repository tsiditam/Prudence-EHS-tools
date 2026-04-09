'use client';

import React, { useState } from 'react';
import {
  Library,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Search,
} from 'lucide-react';

const references = [
  { id: 'OSHA-1910.1200', title: 'Hazard Communication', authority: 'OSHA', type: 'Regulatory', domain: 'Occupational Safety', section: '29 CFR 1910.1200', status: 'active', enforceability: 'Mandatory', summary: 'Employers must have a program to inform workers about chemical hazards in the workplace.' },
  { id: 'OSHA-1910.1200(e)', title: 'Written Hazard Communication Program', authority: 'OSHA', type: 'Regulatory', domain: 'Occupational Safety', section: '29 CFR 1910.1200(e)(1)', status: 'active', enforceability: 'Mandatory', summary: 'Every workplace with hazardous chemicals must have a written plan.' },
  { id: 'OSHA-1910.1200(f)', title: 'Labels and Other Forms of Warning', authority: 'OSHA', type: 'Regulatory', domain: 'Occupational Safety', section: '29 CFR 1910.1200(f)', status: 'active', enforceability: 'Mandatory', summary: 'All containers of hazardous chemicals must have proper GHS-aligned labels.' },
  { id: 'OSHA-1910.1200(g)', title: 'Safety Data Sheets', authority: 'OSHA', type: 'Regulatory', domain: 'Occupational Safety', section: '29 CFR 1910.1200(g)(8)', status: 'active', enforceability: 'Mandatory', summary: 'Employers must keep SDSs accessible during each work shift.' },
  { id: 'OSHA-1910.1200(h)', title: 'Employee Information and Training', authority: 'OSHA', type: 'Regulatory', domain: 'Occupational Safety', section: '29 CFR 1910.1200(h)(1)', status: 'active', enforceability: 'Mandatory', summary: 'Workers must receive training about chemical hazards at initial assignment.' },
  { id: 'OSHA-1910.147', title: 'Control of Hazardous Energy (LOTO)', authority: 'OSHA', type: 'Regulatory', domain: 'Occupational Safety', section: '29 CFR 1910.147', status: 'active', enforceability: 'Mandatory', summary: 'Employers must establish procedures to disable machinery during maintenance.' },
  { id: 'OSHA-1910.147(c)(4)', title: 'Energy Control Procedures', authority: 'OSHA', type: 'Regulatory', domain: 'Occupational Safety', section: '29 CFR 1910.147(c)(4)', status: 'active', enforceability: 'Mandatory', summary: 'Written step-by-step procedures must exist for controlling hazardous energy.' },
  { id: 'OSHA-1910.147(c)(7)', title: 'LOTO Training and Communication', authority: 'OSHA', type: 'Regulatory', domain: 'Occupational Safety', section: '29 CFR 1910.147(c)(7)', status: 'active', enforceability: 'Mandatory', summary: 'All employees involved in LOTO must be trained on the energy control program.' },
  { id: 'OSHA-1910.147(c)(6)', title: 'Periodic Inspection of LOTO Procedures', authority: 'OSHA', type: 'Regulatory', domain: 'Occupational Safety', section: '29 CFR 1910.147(c)(6)', status: 'active', enforceability: 'Mandatory', summary: 'LOTO procedures must be inspected at least annually.' },
  { id: 'OSHA-1910.38', title: 'Emergency Action Plans', authority: 'OSHA', type: 'Regulatory', domain: 'Occupational Safety', section: '29 CFR 1910.38', status: 'active', enforceability: 'Mandatory', summary: 'Workplaces must have a written emergency action plan covering evacuation and reporting.' },
  { id: 'OSHA-1910.134', title: 'Respiratory Protection', authority: 'OSHA', type: 'Regulatory', domain: 'Occupational Safety', section: '29 CFR 1910.134', status: 'active', enforceability: 'Mandatory', summary: 'Employers must have a comprehensive written respiratory protection program.' },
  { id: 'OSHA-1910.134(d)', title: 'Selection of Respirators', authority: 'OSHA', type: 'Regulatory', domain: 'Occupational Safety', section: '29 CFR 1910.134(d)', status: 'active', enforceability: 'Mandatory', summary: 'Respirators must be chosen based on the specific hazards present.' },
  { id: 'OSHA-1910.134(e)', title: 'Medical Evaluation', authority: 'OSHA', type: 'Regulatory', domain: 'Occupational Safety', section: '29 CFR 1910.134(e)', status: 'active', enforceability: 'Mandatory', summary: 'Employees must be medically evaluated before using a respirator.' },
  { id: 'OSHA-1910.134(f)', title: 'Fit Testing', authority: 'OSHA', type: 'Regulatory', domain: 'Occupational Safety', section: '29 CFR 1910.134(f)', status: 'active', enforceability: 'Mandatory', summary: 'Employees must pass a fit test with the exact respirator they will use.' },
  { id: 'ASHRAE-62.1', title: 'Ventilation for Acceptable Indoor Air Quality', authority: 'ASHRAE', type: 'Consensus Standard', domain: 'Indoor Air Quality', section: 'ASHRAE 62.1-2022', status: 'active', enforceability: 'Consensus', summary: 'Sets minimum ventilation requirements for commercial and institutional buildings.' },
  { id: 'ASHRAE-62.2', title: 'Residential Ventilation and IAQ', authority: 'ASHRAE', type: 'Consensus Standard', domain: 'Indoor Air Quality', section: 'ASHRAE 62.2-2022', status: 'active', enforceability: 'Consensus', summary: 'Sets ventilation requirements for homes and apartments.' },
  { id: 'ASHRAE-55', title: 'Thermal Environmental Conditions', authority: 'ASHRAE', type: 'Consensus Standard', domain: 'Indoor Air Quality', section: 'ASHRAE 55-2023', status: 'active', enforceability: 'Consensus', summary: 'Defines acceptable temperature, humidity, and air movement for comfort.' },
  { id: 'ASHRAE-241', title: 'Control of Infectious Aerosols', authority: 'ASHRAE', type: 'Consensus Standard', domain: 'Indoor Air Quality', section: 'ASHRAE 241-2023', status: 'active', enforceability: 'Consensus', summary: 'Sets requirements for buildings to control airborne disease transmission.' },
];

export default function ReferencesPage() {
  const [search, setSearch] = useState('');
  const [authorityFilter, setAuthorityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = references.filter((r) => {
    if (authorityFilter !== 'all' && r.authority !== authorityFilter) return false;
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    if (search && !r.title.toLowerCase().includes(search.toLowerCase()) && !r.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Reference Library</h1>
        <p className="page-description">Authoritative references that back every finding</p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search references..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-64 rounded-lg border border-gray-200 bg-white pl-9 pr-4 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <select value={authorityFilter} onChange={(e) => setAuthorityFilter(e.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm">
          <option value="all">All Authorities</option>
          <option value="OSHA">OSHA</option>
          <option value="ASHRAE">ASHRAE</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm">
          <option value="all">All Types</option>
          <option value="Regulatory">Regulatory</option>
          <option value="Consensus Standard">Consensus Standard</option>
        </select>
        <span className="ml-auto text-sm text-gray-500">{filtered.length} references</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left">
              <th className="px-4 py-3 font-medium text-gray-500"></th>
              <th className="px-4 py-3 font-medium text-gray-500">Reference ID</th>
              <th className="px-4 py-3 font-medium text-gray-500">Title</th>
              <th className="px-4 py-3 font-medium text-gray-500">Authority</th>
              <th className="px-4 py-3 font-medium text-gray-500">Type</th>
              <th className="px-4 py-3 font-medium text-gray-500">Domain</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 font-medium text-gray-500">Enforceability</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((ref) => (
              <React.Fragment key={ref.id}>
                <tr
                  onClick={() => setExpanded(expanded === ref.id ? null : ref.id)}
                  className="cursor-pointer border-b border-gray-50 transition-colors hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    {expanded === ref.id ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{ref.id}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{ref.title}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      ref.authority === 'OSHA' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                    }`}>
                      {ref.authority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{ref.type}</td>
                  <td className="px-4 py-3 text-gray-600">{ref.domain}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      {ref.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{ref.enforceability}</td>
                </tr>
                {expanded === ref.id && (
                  <tr className="bg-gray-50">
                    <td colSpan={8} className="px-8 py-4">
                      <div className="space-y-3">
                        <div>
                          <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Section</span>
                          <p className="mt-0.5 font-mono text-sm text-gray-700">{ref.section}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Plain Language Summary</span>
                          <p className="mt-0.5 text-sm text-gray-700">{ref.summary}</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
