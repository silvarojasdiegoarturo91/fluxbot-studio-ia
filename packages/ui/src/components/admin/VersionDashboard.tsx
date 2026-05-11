import React, { useState, useEffect } from 'react';

interface VersionData {
  version: string;
  status: 'stable' | 'beta' | 'alpha' | 'deprecated';
  releaseDate: string;
  deprecationDate: string | null;
  supportEndDate: string;
  adoptionRate: number;
  websitesCount: number;
  errorsCount: number;
  criticalBugs: string[];
}

interface VersionMetrics {
  [version: string]: {
    websites: number;
    users: number;
    errors24h: number;
    avgResponseTime: number;
  };
}

export const VersionDashboard: React.FC = () => {
  const [versions, setVersions] = useState<VersionData[]>([]);
  const [metrics, setMetrics] = useState<VersionMetrics>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  useEffect(() => {
    fetchVersionData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchVersionData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchVersionData = async () => {
    try {
      setLoading(true);
      // In a real implementation, these would be API calls
      const versionData: VersionData[] = [
        {
          version: '1.0.0',
          status: 'stable',
          releaseDate: '2026-05-11',
          deprecationDate: null,
          supportEndDate: '2027-05-11',
          adoptionRate: 89.5,
          websitesCount: 2547,
          errorsCount: 12,
          criticalBugs: [],
        },
        {
          version: '0.9.x',
          status: 'deprecated',
          releaseDate: '2026-04-01',
          deprecationDate: '2026-11-11',
          supportEndDate: '2027-05-11',
          adoptionRate: 10.2,
          websitesCount: 289,
          errorsCount: 5,
          criticalBugs: [],
        },
      ];

      const metricsData: VersionMetrics = {
        '1.0.0': {
          websites: 2547,
          users: 125430,
          errors24h: 12,
          avgResponseTime: 245,
        },
        '0.9.x': {
          websites: 289,
          users: 8230,
          errors24h: 5,
          avgResponseTime: 289,
        },
      };

      setVersions(versionData);
      setMetrics(metricsData);
      setError(null);
    } catch (err) {
      setError('Failed to load version data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async () => {
    if (!selectedVersion) return;

    try {
      // In a real implementation, this would call an API endpoint
      // that would update .versions.json and invalidate CDN cache
      await fetch('/api/admin/widget/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetVersion: selectedVersion }),
      });

      setShowRollbackConfirm(false);
      setSelectedVersion(null);
      await fetchVersionData();
    } catch (err) {
      setError('Failed to rollback version');
      console.error(err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'stable':
        return 'bg-green-100 text-green-800';
      case 'beta':
        return 'bg-blue-100 text-blue-800';
      case 'alpha':
        return 'bg-purple-100 text-purple-800';
      case 'deprecated':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading version data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-6xl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Widget Version Dashboard</h1>
          <p className="text-gray-500 mt-2">Manage FluxBot External Widget versions</p>
        </div>
        <button
          onClick={fetchVersionData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {versions.map((version) => (
          <div key={version.version} className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{version.version}</h2>
                <span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(version.status)}`}>
                  {version.status.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between">
                <span className="text-gray-600">Release Date:</span>
                <span className="font-mono">{formatDate(version.releaseDate)}</span>
              </div>
              {version.deprecationDate && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Deprecation Date:</span>
                  <span className="font-mono text-orange-600">{formatDate(version.deprecationDate)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Support Ends:</span>
                <span className="font-mono">{formatDate(version.supportEndDate)}</span>
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">Adoption Rate</span>
                  <span className="font-bold">{version.adoptionRate}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${version.adoptionRate}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-blue-50 p-3 rounded">
                  <div className="text-sm text-gray-600">Websites</div>
                  <div className="text-lg font-bold">{metrics[version.version]?.websites.toLocaleString()}</div>
                </div>
                <div className="bg-green-50 p-3 rounded">
                  <div className="text-sm text-gray-600">Users</div>
                  <div className="text-lg font-bold">{metrics[version.version]?.users.toLocaleString()}</div>
                </div>
                <div className="bg-red-50 p-3 rounded">
                  <div className="text-sm text-gray-600">Errors (24h)</div>
                  <div className="text-lg font-bold">{metrics[version.version]?.errors24h}</div>
                </div>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Avg Response:</span>
                <span className="font-mono">{metrics[version.version]?.avgResponseTime}ms</span>
              </div>
            </div>

            {version.criticalBugs.length > 0 && (
              <div className="mt-4 p-3 bg-red-100 rounded">
                <h4 className="font-semibold text-red-800 mb-2">Critical Bugs</h4>
                <ul className="list-disc list-inside space-y-1">
                  {version.criticalBugs.map((bug, idx) => (
                    <li key={idx} className="text-sm text-red-700">
                      {bug}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {version.status !== 'stable' && (
              <button
                onClick={() => {
                  setSelectedVersion(version.version);
                  setShowRollbackConfirm(true);
                }}
                className="mt-4 w-full px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition text-sm"
              >
                Rollback to {version.version}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-bold mb-4">Documentation</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a
            href="/docs/VERSIONING.md"
            className="p-4 border rounded hover:bg-gray-50 transition"
            target="_blank"
            rel="noopener noreferrer"
          >
            <h4 className="font-semibold text-blue-600">Versioning Policy</h4>
            <p className="text-sm text-gray-600 mt-2">Learn about semantic versioning and release cycle</p>
          </a>
          <a
            href="/docs/UPGRADE.md"
            className="p-4 border rounded hover:bg-gray-50 transition"
            target="_blank"
            rel="noopener noreferrer"
          >
            <h4 className="font-semibold text-blue-600">Upgrade Guide</h4>
            <p className="text-sm text-gray-600 mt-2">Step-by-step migration from previous versions</p>
          </a>
          <a
            href="/docs/ROLLBACK.md"
            className="p-4 border rounded hover:bg-gray-50 transition"
            target="_blank"
            rel="noopener noreferrer"
          >
            <h4 className="font-semibold text-blue-600">Rollback Procedure</h4>
            <p className="text-sm text-gray-600 mt-2">Emergency procedures for production issues</p>
          </a>
          <a
            href="/CHANGELOG.md"
            className="p-4 border rounded hover:bg-gray-50 transition"
            target="_blank"
            rel="noopener noreferrer"
          >
            <h4 className="font-semibold text-blue-600">Changelog</h4>
            <p className="text-sm text-gray-600 mt-2">Release notes and history</p>
          </a>
        </div>
      </div>

      {showRollbackConfirm && selectedVersion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm">
            <h3 className="text-xl font-bold mb-4">Confirm Rollback</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to rollback to version <span className="font-mono">{selectedVersion}</span>?
              This will update the CDN within 1-2 minutes.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRollbackConfirm(false);
                  setSelectedVersion(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-900 rounded hover:bg-gray-400 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRollback}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
              >
                Confirm Rollback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VersionDashboard;
