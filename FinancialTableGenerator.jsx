import React, { useState, useRef, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const numberFormatter = new Intl.NumberFormat();
const COLORS = ['#8884d8','#82ca9d','#ffc658','#ff8042','#8dd1e1','#a4de6c','#d0ed57','#a28fd0'];
const INPUT_CATEGORIES = ['Earnings','Rent/Interest Paid','Insurance Paid','Maintenance','Rates (Taxes)','Principal Paid'];
const PERIOD_OPTIONS = ['Q1','Q2','Q3','Q4','6 Months','Full Year'];

const getClassification = percent =>
  percent <= 30 ? 'Ideal (≤30%)'
  : percent <= 50 ? 'Cost-burdened (30–50%)'
  : 'Severely cost-burdened (>50%)';

export default function FinancialTableGenerator({ initialPeriod = 'Full Year', initialYear = '2024' }) {
  const [period, setPeriod] = useState(initialPeriod);
  const [year, setYear] = useState(initialYear);
  const [items, setItems] = useState(INPUT_CATEGORIES.map(name => ({ name, amount: '' })));
  const [notes, setNotes] = useState('');
  const [showReport, setShowReport] = useState(false);
  const reportRef = useRef(null);

  const formatAmount = useCallback(amount => {
    const [intPart, decPart] = amount.toFixed(2).split('.');
    const formattedInt = numberFormatter.format(Number(intPart));
    return decPart === '00' ? formattedInt : `${formattedInt}.${decPart}`;
  }, []);

  const handleChange = useCallback((index, field, value) => {
    setItems(prev => prev.map((it, i) => i === index ? { ...it, [field]: value } : it));
  }, []);

  const handleAddRow = useCallback(() => {
    setItems(prev => [...prev, { name: '', amount: '' }]);
  }, []);

  const clearAll = useCallback(() => {
    setPeriod(initialPeriod);
    setYear(initialYear);
    setItems(INPUT_CATEGORIES.map(name => ({ name, amount: '' })));
    setNotes('');
    setShowReport(false);
  }, [initialPeriod, initialYear]);

  const parsed = useMemo(() =>
    items.map(it => ({ name: it.name, value: parseFloat(it.amount.replace(/,/g, '')) || 0 })),
    [items]
  );
  const income = useMemo(() => parsed.find(n => n.name === 'Earnings')?.value || 0, [parsed]);
  const nonPrincipal = useMemo(() =>
    parsed.filter(n => INPUT_CATEGORIES.slice(1,5).includes(n.name)).reduce((sum, n) => sum + n.value, 0),
    [parsed]
  );
  const exp30 = income * 0.3;
  const exp50 = income * 0.5;
  const pctIncome = income ? (nonPrincipal / income) * 100 : 0;
  const classification = useMemo(() => getClassification(pctIncome), [pctIncome]);
  const classificationColor = classification.startsWith('Ideal')
    ? 'text-green-600' : classification.startsWith('Cost-burdened')
    ? 'text-yellow-600' : 'text-red-600';

  const weeks = useMemo(() => (typeof period === 'string' && period.startsWith('Q')) ? 13 : period === '6 Months' ? 26 : 52, [period]);
  const weeklyRent = useMemo(() => nonPrincipal / weeks, [nonPrincipal, weeks]);
  const affordableWeekly = useMemo(() => income ? (income / weeks) * 0.3 : 0, [income, weeks]);

  const finalItems = useMemo(() => {
    const base = [
      ...parsed,
      { name: 'Total Non-Principal Housing Expense', value: nonPrincipal },
      { name: 'Total Mortgage Outlay', value: (parsed.find(n => n.name === 'Rent/Interest Paid')?.value || 0) + (parsed.find(n => n.name === 'Principal Paid')?.value || 0) }
    ];
    return [...base,
      { name: 'Estimated Weekly Rent', value: weeklyRent },
      { name: 'Affordable Weekly Rent', value: affordableWeekly }
    ];
  }, [parsed, nonPrincipal, weeklyRent, affordableWeekly]);

  const tableData = useMemo(() => finalItems.map(it => {
    if (it.name === 'Estimated Weekly Rent') {
      const diff = it.value - affordableWeekly;
      return {
        name: it.name,
        value: it.value,
        percent: diff > 0 ? `Overspending by $${formatAmount(diff)}` : `Under by $${formatAmount(Math.abs(diff))}`
      };
    }
    if ([ 'Affordable Weekly Rent','Earnings'].includes(it.name)) {
      return { name: it.name, value: it.value, percent: '' };
    }
    return { name: it.name, value: it.value, percent: income ? `${((it.value / income) * 100).toFixed(2)}%` : '' };
  }), [finalItems, income, affordableWeekly, formatAmount]);

  const chartItems = useMemo(() => tableData.filter(d => d.name !== 'Earnings' && parseFloat(d.percent) >= 4), [tableData]);

  const templates = useMemo(() => {
    const t = [];
    t.push(`Non-Principal Housing Expense (${period}): $${formatAmount(nonPrincipal)} (${pctIncome.toFixed(2)}% of income)`);
    t.push(`Classification: ${classification}`);
    const pp = parsed.find(d => d.name === 'Principal Paid');
    if (pp) {
      t.push(`Principal Paid: $${formatAmount(pp.value)} (${income ? ((pp.value / income) * 100).toFixed(2) : '0.00'}% of income)`);
    }
    const totalDiff = (weeklyRent - affordableWeekly) * weeks;
    t.push(totalDiff > 0 ? `Total overspending for ${period}: $${formatAmount(totalDiff)}` : `Total savings for ${period}: $${formatAmount(Math.abs(totalDiff))}`);
    return t;
  }, [period, nonPrincipal, pctIncome, classification, parsed, income, weeklyRent, affordableWeekly, weeks, formatAmount]);

  const title = `Housing Expense Report excluding principal paid ${year}${period !== 'Full Year' ? ` ${period}` : ''}`;
  const filename = `${year}_${period.replace(/\s/g,'_')}_Housing_Expense_Report.pdf`;

  const downloadPDF = useCallback(async () => {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current);
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF(); pdf.addImage(imgData, 'PNG', 10, 10, 190, 0);
    pdf.save(filename);
  }, [filename]);

  return (
    <div className="p-4">
      <Card>
        <CardHeader><CardTitle>Housing Expense Report</CardTitle></CardHeader>
        <CardContent>
          {!showReport ? (
            <>  {/* Data Entry */}
              <div className="flex space-x-4 mb-4">
                <div>
                  <label>Period</label>
                  <select value={period} onChange={e => setPeriod(e.target.value)} className="p-2 border rounded">
                    {PERIOD_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label>Year</label>
                  <input type="number" value={year} onChange={e => setYear(e.target.value)} className="w-24 p-2 border rounded" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items.map((it, idx) => (
                  <div key={idx} className="flex space-x-2">
                    <input type="text" value={it.name} disabled={idx < INPUT_CATEGORIES.length} className={`flex-1 p-2 border rounded ${idx < INPUT_CATEGORIES.length ? 'bg-gray-100' : ''}`} />
                    <input type="text" placeholder="Amount" value={it.amount ? formatAmount(parseFloat(it.amount) || 0) : ''} onChange={e => handleChange(idx, 'amount', e.target.value.replace(/,/g, ''))} className="w-32 p-2 border rounded" />
                  </div>
                ))}
              </div>
              <div className="mt-4 space-x-2">
                <Button onClick={handleAddRow}>Add Category</Button>
                <Button onClick={() => setShowReport(true)}>Generate Report</Button>
                <Button variant="destructive" onClick={clearAll}>Clear Data</Button>
              </div>
            </>
          ) : (
            <div ref={reportRef}>
              <h2 className="text-xl font-bold mb-4">{title}</h2>

              <div className="p-4 mb-6 bg-gray-50 rounded">
                <p><strong>Non-Principal Housing Expense ({period}):</strong> ${formatAmount(nonPrincipal)} (<span className={classificationColor}>{pctIncome.toFixed(2)}% of income</span>)</p>
                <p><strong>Benchmarks:</strong></p>
                <ul className="list-disc list-inside">
                  <li>Ideal (≤30%): ≤${formatAmount(exp30)}</li>
                  <li>Cost-burdened (30–50%): ${formatAmount(exp30)}–${formatAmount(exp50)}</li>
                  <li>Severely cost-burdened (&gt;50%): &gt;${formatAmount(exp50)}</li>
                </ul>
                <p className={classificationColor}><strong>Classification:</strong> {classification}</p>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2">Summary</h3>
                <div className="p-2 border rounded bg-gray-50 whitespace-pre-wrap">
                  {templates.map((line, i) => {
                    let cls = '';
                    if (line.includes('% of income')) {
                      const m = line.match(/\(([^)]+)%/);
                      const v = m ? parseFloat(m[1]) : 0;
                      cls = v > 50 ? 'text-red-600' : v > 30 ? 'text-yellow-600' : 'text-green-600';
                    } else if (line.startsWith('Classification')) cls = classificationColor;
                    else if (line.startsWith('Total overspending')) cls = 'text-red-600';
                    else if (line.startsWith('Principal Paid')) cls = 'text-green-600';
                    return <div key={i} className={cls}>{line}</div>;
                  })}
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2">Your Notes</h3>
                <div className="mb-2">
                  <label className="block mb-1">Insert Prompt:</label>
                  <select className="w-full p-2 border rounded" onChange={e => {
                    const prompt = e.target.value;
                    if (prompt) setNotes(prev => prev ? prev + '\n' + prompt : prompt);
                    e.target.selectedIndex = 0;
                  }}>
                    <option value="">--Select--</option>
                    {templates.map((t, i) => (
                      <option key={i} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <textarea
                  rows={14}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full p-2 border rounded whitespace-pre-wrap"
                  placeholder="Write your own observations here..."
                />
              </div>

              <table className="w-full mb-6 border-collapse">
                <thead>
                  <tr>
                    <th className="border p-2">Category</th>
                    <th className="border p-2">Amount</th>
                    <th className="border p-2">%</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((d, idx) => (
                    <tr key={idx}>
                      <td className="border p-2">{d.name}</td>
                      <td className="border p-2">${formatAmount(d.value)}</td>
                      <td className="border p-2">{d.percent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ height: 300 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={chartItems} dataKey="value" nameKey="name" outerRadius={100} labelLine={false} label={({ payload }) => `${payload.percent}%`}>
                      {chartItems.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={val => `$${val.toFixed(2)}`} />
                    <Legend layout="vertical" align="right" verticalAlign="middle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 space-x-2">
                <Button type="button" onClick={downloadPDF}>Download PDF</Button>
                <Button onClick={() => setShowReport(false)}>Edit Data</Button>
                <Button variant="destructive" onClick={clearAll}>Clear Data</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

FinancialTableGenerator.propTypes = {
  initialPeriod: PropTypes.string,
  initialYear: PropTypes.string
};
