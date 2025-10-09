import { useMemo, useState } from 'react';

function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/);
  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].split(',').map((value) => value.trim());
  const records = [];

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) continue;
    const columns = row.split(',');
    const record = {};
    headers.forEach((header, columnIndex) => {
      record[header] = columns[columnIndex]?.trim?.() ?? '';
    });
    records.push(record);
  }

  return records;
}

function encodeToBase64(content) {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return window.btoa(unescape(encodeURIComponent(content)));
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(content, 'utf-8').toString('base64');
  }
  throw new Error('Unable to encode dataset without base64 support.');
}

export default function BulkDataUploadModal({
  isOpen,
  onClose,
  onUpload,
  defaultOwner = '',
  defaultRepo = '',
  defaultBranch = 'main',
  defaultPath = 'data/property_signals.json',
}) {
  const [githubOwner, setGithubOwner] = useState(defaultOwner);
  const [githubRepo, setGithubRepo] = useState(defaultRepo);
  const [githubBranch, setGithubBranch] = useState(defaultBranch);
  const [githubPath, setGithubPath] = useState(defaultPath);
  const [githubToken, setGithubToken] = useState('');
  const [datasetName, setDatasetName] = useState('Custom bulk dataset');
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isReady = useMemo(() => {
    return (
      !!githubOwner &&
      !!githubRepo &&
      !!githubBranch &&
      !!githubPath &&
      !!githubToken &&
      selectedFile instanceof File &&
      !isSubmitting
    );
  }, [githubOwner, githubRepo, githubBranch, githubPath, githubToken, selectedFile, isSubmitting]);

  if (!isOpen) {
    return null;
  }

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    setSelectedFile(file ?? null);
    setStatus(null);
    setError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedFile) {
      setError('Choose a CSV or JSON file to upload.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setStatus('Uploading to GitHub…');

    try {
      const text = await selectedFile.text();
      let parsed;
      if (selectedFile.name.toLowerCase().endsWith('.json')) {
        parsed = JSON.parse(text);
      } else {
        parsed = parseCsv(text);
      }

      const payload = Array.isArray(parsed) ? parsed : [parsed];
      const content = JSON.stringify({ name: datasetName, updatedAt: new Date().toISOString(), records: payload }, null, 2);
      const base64 = encodeToBase64(content);

      await onUpload({
        datasetName,
        data: payload,
        github: {
          owner: githubOwner,
          repo: githubRepo,
          branch: githubBranch,
          path: githubPath,
          token: githubToken,
          rawContent: content,
          base64,
        },
      });

      setStatus('Upload complete. Dataset now powers live queries.');
      setIsSubmitting(false);
    } catch (uploadError) {
      console.error(uploadError);
      setError(uploadError.message || 'Unable to upload dataset.');
      setIsSubmitting(false);
      setStatus(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Upload bulk dataset</h2>
            <p className="text-sm text-slate-500">
              Provide a CSV or JSON export with street-level metrics. Records are written to GitHub and override live API
              results until refreshed.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <form className="space-y-6 px-6 py-6" onSubmit={handleSubmit}>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">GitHub target</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                Owner or organisation
                <input
                  value={githubOwner}
                  onChange={(event) => setGithubOwner(event.target.value)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  placeholder="e.g. proptech-labs"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                Repository
                <input
                  value={githubRepo}
                  onChange={(event) => setGithubRepo(event.target.value)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  placeholder="e.g. street-forecaster"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                Branch
                <input
                  value={githubBranch}
                  onChange={(event) => setGithubBranch(event.target.value)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  placeholder="main"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                File path
                <input
                  value={githubPath}
                  onChange={(event) => setGithubPath(event.target.value)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  placeholder="data/property_signals.json"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              GitHub personal access token
              <input
                type="password"
                value={githubToken}
                onChange={(event) => setGithubToken(event.target.value)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                placeholder="ghp_…"
              />
              <span className="text-xs text-slate-400">
                Token requires <code>repo:contents</code> scope to create or update files.
              </span>
            </label>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">Dataset details</h3>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              Dataset name
              <input
                value={datasetName}
                onChange={(event) => setDatasetName(event.target.value)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                placeholder="e.g. FY5 micro-market back-test"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              Upload file
              <input
                type="file"
                accept=".csv,.json"
                onChange={handleFileChange}
                className="text-sm"
              />
              <span className="text-xs text-slate-400">
                Include columns such as <code>postcode</code>, <code>house_number</code>, <code>median_price</code>,
                <code>rent_index</code>, <code>planning_pending</code>, etc.
              </span>
            </label>
          </section>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          {status ? <p className="text-sm text-emerald-600">{status}</p> : null}

          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <p className="text-xs text-slate-400">
              Uploaded content is committed to GitHub via the REST contents API and cached locally until refreshed.
            </p>
            <button
              type="submit"
              disabled={!isReady}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Uploading…' : 'Upload dataset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
