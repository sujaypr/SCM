import * as XLSX from 'xlsx';

export const exportToCSV = (data, filename) => {
  if (!data || !data.length) return;

  // Convert data to CSV format
  const headers = Object.keys(data[0]);
  const csvRows = [
    // Headers
    headers.join(','),
    // Data rows
    ...data.map(row => 
      headers.map(header => {
        let value = row[header];
        // Handle numbers
        if (typeof value === 'number') return value;
        // Handle nulls
        if (value === null || value === undefined) return '';
        // Handle objects and arrays
        if (typeof value === 'object') value = JSON.stringify(value);
        // Handle strings with commas or quotes
        if (typeof value === 'string') {
          value = value.replace(/"/g, '""');
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            value = `"${value}"`;
          }
        }
        return value;
      }).join(',')
    )
  ].join('\n');

  // Create and download the file
  const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (navigator.msSaveBlob) {
    // IE 10+
    navigator.msSaveBlob(blob, filename);
  } else {
    // Other browsers
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

export const exportToExcel = async (data, filename) => {
  if (!data || !data.length) return;

  try {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);

    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

    // Generate and download the file
    XLSX.writeFile(workbook, filename);
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    // Fallback to CSV
    exportToCSV(data, filename.replace('.xlsx', '.csv'));
  }
};