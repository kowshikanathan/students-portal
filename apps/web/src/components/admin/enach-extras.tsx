'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAdminApi } from './context';
import { mandateAccount, mandateViews, type MandateDashboardData, type MandateView } from './mandate-view-model';

type CustomField = {
  id: string;
  key: string;
  label: string;
  kind: 'text' | 'number' | 'date' | 'choice';
  options: string[];
};
type CustomValue = { field_id: string; record_id: string; value: string };
type RecordRow = Record<string, unknown>;
type Props = {
  data: MandateDashboardData;
  view: MandateView;
  onViewChange: (view: MandateView) => void;
  loaded: boolean;
  failedResources: string[];
};

const help: Record<string, string> = {
  fields: 'Create optional operational fields for existing records. They are stored separately from bank data, cannot change mandate or debit status, and never affect payment instructions.',
  type: 'Choose the type of records these values belong to: mandates, setup attempts, automatic debits, settlements, or checkouts.',
  fieldKey: 'Choose a stable internal name starting with a lowercase letter, such as campus_code. Spaces are not allowed.',
  fieldLabel: 'This is the human-readable label colleagues will see, such as Campus code.',
  fieldKind: 'Text accepts short notes; Number accepts digits; Date uses a calendar; Choice restricts entries to approved options.',
  fieldOptions: 'For Choice fields, enter permitted values separated by commas, such as North, South, East.',
  record: 'Select an existing financial record. Custom values annotate it; they do not create a mandate or a transaction.',
  value: 'Enter an optional operational note or value. Never enter bank credentials, OTPs, PINs, or other sensitive account details.',
  report: 'Download a CSV of the currently loaded records for the selected record type. Filters and selected columns apply; the export is not a full-ledger audit report.',
  status: 'Filter by the status returned by the payment backend. No status is inferred or changed.',
  date: 'Filter records using their recorded creation timestamp. Missing timestamps will not pass a date filter.',
};

export function EnachInfo({ topic, label = 'Show help' }: { topic: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="enach-help">
      <button type="button" title={label} aria-label={label} aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}>
        ⓘ <span className="enach-help-eye" aria-hidden="true">👁</span>
      </button>
      {open && <span className="enach-help-note" role="note">{help[topic] || topic}</span>}
    </span>
  );
}

function csvCell(input: unknown): string {
  const text = String(input ?? '').replace(/\r\n?/g, '\n');
  // Prevent Excel/Sheets from executing spreadsheet formulas in untrusted values.
  const safe = /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function makeEnachCsv(rows: RecordRow[], columns: Array<{ key: string; title: string }>) {
  return [
    columns.map((column) => csvCell(column.title)).join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column.key])).join(',')),
  ].join('\r\n');
}

export function EnachExtras({ data, view, onViewChange, loaded, failedResources }: Props) {
  const { request, session } = useAdminApi();
  const [fields, setFields] = useState<CustomField[]>([]);
  const [values, setValues] = useState<CustomValue[]>([]);
  const [fieldError, setFieldError] = useState('');
  const [fieldMessage, setFieldMessage] = useState('');
  const [valueError, setValueError] = useState('');
  const [valueMessage, setValueMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldType, setFieldType] = useState<CustomField['kind']>('text');
  const [chosenField, setChosenField] = useState('');
  const [chosenRecord, setChosenRecord] = useState('');
  const [entry, setEntry] = useState('');
  const [reportType, setReportType] = useState<MandateView>(view);
  const [reportRevision, setReportRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [included, setIncluded] = useState<string[]>([
    'account_reference', 'status', 'rail', 'provider_reference', 'created_at',
  ]);

  const recordTypes = mandateViews.map((item) => ({ value: item.id, title: item.label }));
  const readOnly = session.tenant.readOnly === true;
  const activeField = fields.find((field) => field.id === chosenField);
  const rows = data[view] as RecordRow[];
  const selectedRecord = rows.find((row) => String(row.id) === chosenRecord);
  const currentValue = values.find(
    (value) => value.record_id === chosenRecord && value.field_id === chosenField,
  );

  async function loadFields() {
    setFieldError('');
    try {
      const result = await request<CustomField[]>('admin/enach/fields');
      setFields(result);
    } catch (e) {
      setFieldError('Could not load custom fields: ' + (e as Error).message);
    }
  }

  async function loadValues(type: MandateView) {
    setValueError('');
    try {
      setValues(await request<CustomValue[]>('admin/enach/values/' + type));
    } catch (e) {
      setValues([]);
      setValueError('Could not load annotations: ' + (e as Error).message);
    }
  }

  useEffect(() => {
    setFields([]);
    setValues([]);
    setChosenField('');
    setChosenRecord('');
    void loadFields();
  }, [session.tenant.id]);
  useEffect(() => {
    setChosenRecord('');
    setChosenField('');
    setEntry('');
    void loadValues(view);
  }, [session.tenant.id, view]);
  useEffect(() => {
    setReportType(view);
  }, [view]);
  useEffect(() => {
    setSearch('');
    setStatus('');
    setFrom('');
    setTo('');
  }, [reportType]);
  useEffect(() => {
    setEntry(currentValue?.value || '');
  }, [chosenField, chosenRecord, currentValue?.value]);

  async function addField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    const form = event.currentTarget;
    const inputs = new FormData(form);
    const rawOptions = String(inputs.get('options') || '');
    const options = fieldType === 'choice'
      ? rawOptions.split(',').map((part) => part.trim()).filter(Boolean)
      : [];
    setBusy(true);
    setFieldError('');
    setFieldMessage('');
    try {
      await request('admin/enach/fields', 'POST', {
        key: String(inputs.get('key') || '').trim(),
        label: String(inputs.get('label') || '').trim(),
        kind: fieldType,
        options,
      });
      await loadFields();
      setFieldMessage('Optional eNACH field created. Existing financial records were not changed.');
      form.reset();
      setFieldType('text');
    } catch (e) {
      setFieldError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveValue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || !selectedRecord || !activeField) return;
    setBusy(true);
    setValueError('');
    setValueMessage('');
    try {
      await request('admin/enach/values', 'POST', {
        fieldId: activeField.id,
        recordType: view,
        recordId: String(selectedRecord.id),
        value: entry.trim(),
      });
      await loadValues(view);
      if (reportType === view) setReportRevision((previous) => previous + 1);
      setValueMessage('Operational field saved. No financial status or bank instruction changed.');
    } catch (e) {
      setValueError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const exportFields = useMemo(() => fields.map((field) => ({
    key: 'field_' + field.id,
    title: field.label,
  })), [fields]);
  const standardColumns = [
    { key: 'account_reference', title: 'Account reference' },
    { key: 'status', title: 'Status' },
    { key: 'rail', title: 'Payment rail' },
    { key: 'provider', title: 'Provider' },
    { key: 'provider_reference', title: 'Provider reference' },
    { key: 'amount_minor', title: 'Amount (minor units)' },
    { key: 'attempt_no', title: 'Attempt number' },
    { key: 'failure_code', title: 'Failure code' },
    { key: 'created_at', title: 'Created at' },
    { key: 'updated_at', title: 'Updated at' },
  ];
  const allColumns = [...standardColumns, ...exportFields];
  const reportRows = data[reportType] as RecordRow[];
  const reportFailed = failedResources.includes(reportType);
  const filtered = reportRows.filter((row) => {
    const text = [row.account_reference, row.provider_reference, row.status]
      .some((value) => String(value ?? '').toLowerCase().includes(search.toLowerCase()));
    if (!text) return false;
    if (status && String(row.status ?? '') !== status) return false;
    if (from || to) {
      const created = String(row.created_at || '').slice(0, 10);
      if (!created || (from && created < from) || (to && created > to)) return false;
    }
    return true;
  });
  const reportStatuses = [...new Set(reportRows.map((row) => String(row.status || '')).filter(Boolean))];

  function exportCsv() {
    if (!loaded || reportFailed || included.length === 0) return;
    const reportValues = valuesForType;
    const report = filtered.map((row) => {
      const result: RecordRow = { ...row };
      for (const field of fields) {
        result['field_' + field.id] = reportValues.find(
          (value) => value.record_id === String(row.id) && value.field_id === field.id,
        )?.value || '';
      }
      return result;
    });
    const csv = makeEnachCsv(report, allColumns.filter((column) => included.includes(column.key)));
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dodo-enach-' + reportType + '-loaded-records.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  // Each report's annotations must be loaded from the same tenant and record type.
  const [reportValues, setReportValues] = useState<CustomValue[]>([]);
  const [reportError, setReportError] = useState('');
  const [reportValuesLoaded, setReportValuesLoaded] = useState(false);
  useEffect(() => {
    setReportValues([]);
    setReportValuesLoaded(false);
    setReportError('');
    let cancelled = false;
    void request<CustomValue[]>('admin/enach/values/' + reportType)
      .then((result) => { if (!cancelled) { setReportValues(result); setReportValuesLoaded(true); } })
      .catch((error) => { if (!cancelled) setReportError((error as Error).message); });
    return () => { cancelled = true; };
  }, [session.tenant.id, reportType, reportRevision]);
  const valuesForType = reportValues;

  return (
    <>
      <section id="enach-custom-fields" className="admin-panel enach-extras" aria-label="eNACH custom fields">
        <div className="enach-section-heading">
          <h2>Custom fields</h2>
          <EnachInfo topic="fields" label="Explain custom eNACH fields" />
        </div>
        <p>Create optional fields such as campus, internal team, follow-up date or department.
          They apply only inside the eNACH console and never change mandate/payment outcomes.</p>
        <form className="enach-form" onSubmit={(event) => void addField(event)}>
          <div className="enach-form-grid">
            <label className="field">
              <span>Field key <EnachInfo topic="fieldKey" label="Explain field key" /></span>
              <input name="key" pattern="[a-z][a-z0-9_]{1,39}" maxLength={40}
                placeholder="campus_code" required disabled={busy || readOnly} />
            </label>
            <label className="field">
              <span>Field label <EnachInfo topic="fieldLabel" label="Explain field label" /></span>
              <input name="label" minLength={2} maxLength={80}
                placeholder="Campus code" required disabled={busy || readOnly} />
            </label>
            <label className="field">
              <span>Field type <EnachInfo topic="fieldKind" label="Explain field type" /></span>
              <select value={fieldType} onChange={(event) =>
                setFieldType(event.target.value as CustomField['kind'])} disabled={busy || readOnly}>
                <option value="text">Short text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="choice">Dropdown choice</option>
              </select>
            </label>
            {fieldType === 'choice' && (
              <label className="field">
                <span>Allowed choices <EnachInfo topic="fieldOptions" label="Explain allowed choices" /></span>
                <input name="options" placeholder="North, South, East" required
                  maxLength={600} disabled={busy || readOnly} />
              </label>
            )}
          </div>
          <button className="button primary" type="submit" disabled={busy || readOnly || fields.length >= 30}>
            Add custom field
          </button>
        </form>
        <p className="small">Saved fields ({fields.length}/30): {fields.length
          ? fields.map((field) => field.label).join(', ') : 'None yet'}</p>
        {fieldMessage && <p role="status" className="admin-feedback">{fieldMessage}</p>}
        {fieldError && <p role="alert" className="error-card">{fieldError}</p>}
        <h3>Attach a custom value to a record</h3>
        <p className="small">Select a record type using the eNACH sidebar above, then pick an existing record.</p>
        <form className="enach-form" onSubmit={(event) => void saveValue(event)}>
          <div className="enach-form-grid">
            <label className="field">
              <span>Record type <EnachInfo topic="type" label="Explain record type" /></span>
              <select value={view} onChange={(event) => onViewChange(event.target.value as MandateView)}>
                {recordTypes.map((type) => <option key={type.value} value={type.value}>{type.title}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Existing record <EnachInfo topic="record" label="Explain record selection" /></span>
              <select value={chosenRecord} onChange={(event) => setChosenRecord(event.target.value)}
                required disabled={rows.length === 0}>
                <option value="">Select a record…</option>
                {rows.filter((row) => typeof row.id === 'string').slice(0, 100).map((row) =>
                  <option key={String(row.id)} value={String(row.id)}>
                    {mandateAccount(row)} · {String(row.status || '')}
                  </option>)}
              </select>
            </label>
            <label className="field">
              Custom field
              <select value={chosenField} onChange={(event) => setChosenField(event.target.value)}
                required disabled={fields.length === 0}>
                <option value="">Select a field…</option>
                {fields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
              </select>
            </label>
            {activeField && (
              <label className="field">
                <span>Custom value <EnachInfo topic="value" label="Explain custom value" /></span>
                {activeField.kind === 'choice' ? (
                  <select value={entry} onChange={(event) => setEntry(event.target.value)}
                    disabled={busy || readOnly}>
                    <option value="">Clear value</option>
                    {activeField.options.map((option) =>
                      <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : (
                  <input type={activeField.kind === 'date' ? 'date' :
                    activeField.kind === 'number' ? 'number' : 'text'}
                    step={activeField.kind === 'number' ? '0.0001' : undefined}
                    value={entry} onChange={(event) => setEntry(event.target.value)}
                    maxLength={160} disabled={busy || readOnly}
                    placeholder="Enter value (or clear to remove)" />
                )}
              </label>
            )}
          </div>
          <button type="submit" className="button outline" disabled={
            busy || readOnly || !chosenRecord || !activeField
          }>Save custom value</button>
          {currentValue && <p className="small">Saved value: {currentValue.value}</p>}
        </form>
        {valueMessage && <p className="admin-feedback" role="status">{valueMessage}</p>}
        {valueError && <p className="error-card" role="alert">{valueError}</p>}
      </section>

      <section id="enach-reports" className="admin-panel enach-extras" aria-label="eNACH report builder">
        <div className="enach-section-heading">
          <h2>Report builder</h2>
          <EnachInfo topic="report" label="Explain eNACH report builder" />
        </div>
        <p>Choose a record type, filter the loaded records, select columns and download a CSV report.
          Empty results are exported with headers only. Reports do not change financial records.</p>
        <div className="enach-form-grid">
          <label className="field">
            Record type
            <select value={reportType} onChange={(event) => setReportType(event.target.value as MandateView)}>
              {recordTypes.map((type) => <option value={type.value} key={type.value}>{type.title}</option>)}
            </select>
          </label>
          <label className="field">
            Search account, provider or status
            <input value={search} maxLength={120}
              onChange={(event) => setSearch(event.target.value)} placeholder="Optional search" />
          </label>
          <label className="field">
            <span>Status <EnachInfo topic="status" label="Explain status filter" /></span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              {reportStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="field">
            <span>From date <EnachInfo topic="date" label="Explain date filter" /></span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="field">
            To date
            <input type="date" min={from || undefined} value={to}
              onChange={(event) => setTo(event.target.value)} />
          </label>
        </div>
        <fieldset className="enach-column-chooser">
          <legend>Columns to include</legend>
          {allColumns.map((column) =>
            <label key={column.key}>
              <input type="checkbox" checked={included.includes(column.key)}
                onChange={(event) => setIncluded((prev) => event.target.checked
                  ? [...prev, column.key] : prev.filter((key) => key !== column.key))} />
              {column.title}
            </label>)}
        </fieldset>
        <p role="status" className="small">Matched {filtered.length} of {reportRows.length} loaded {reportType} records.</p>
        {reportFailed && <p role="alert" className="error-card">This record type could not load. Retry records before exporting.</p>}
        {reportError && <p role="alert" className="error-card">Custom field values could not load: {reportError}</p>}
        <button type="button" className="button primary"
          disabled={!loaded || reportFailed || !reportValuesLoaded || !!reportError || included.length === 0 ||
            !!(from && to && to < from)}
          onClick={exportCsv}>Download CSV report</button>
        <p className="small">This report includes only records loaded in your current session, not an exhaustive
          ledger export. Handle downloaded financial data according to your institution's privacy policy.</p>
      </section>
    </>
  );
}
