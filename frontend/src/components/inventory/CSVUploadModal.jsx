import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stepper,
  Step,
  StepLabel,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  LinearProgress,
  Checkbox,
  FormControlLabel,
  IconButton,
  Chip
} from '@mui/material';
import { useDropzone } from 'react-dropzone';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import CloseIcon from '@mui/icons-material/Close';
import axios from 'axios';

// Normalize API base so we don't end up with /api/api when VITE_API_URL already contains /api
const RAW_API_URL = import.meta.env.VITE_API_URL || '';
const API_BASE = (() => {
  if (!RAW_API_URL) return '/api';
  const url = RAW_API_URL.replace(/\/+$/,'');
  return url.endsWith('/api') ? url : `${url}/api`;
})();

const CSVUploadModal = ({ open, onClose, onSuccess, businessInfo }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});
  const [validationResults, setValidationResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [importOptions, setImportOptions] = useState({
    skipErrors: false,
    updateExisting: false,
    enableAiEnrichment: true
  });

  const steps = ['Upload CSV', 'Map Columns', 'Validate', 'Import'];

  // Keep only essential fields to match simplified Add Item form
  const systemFields = [
    'name',
    'category',
    'sku',
    'current_stock',
    'min_stock_level',
    'max_stock_level'
  ];

  // Dropzone configuration
  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setCsvFile(file);
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(`${API_BASE}/inventory/csv/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.success) {
        setCsvData(response.data.data);
        setColumnMapping(response.data.data.suggested_mapping || {});
        setActiveStep(1);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload CSV');
    } finally {
      setLoading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv']
    },
    maxFiles: 1
  });

  const handleValidate = async () => {
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append('mapping', JSON.stringify(columnMapping));
      formData.append('skip_errors', importOptions.skipErrors);

      const response = await axios.post(`${API_BASE}/inventory/csv/validate`, formData);

      setValidationResults(response.data.data);
      setActiveStep(2);
    } catch (err) {
      setError(err.response?.data?.message || 'Validation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append('mapping', JSON.stringify(columnMapping));
      formData.append('skip_errors', importOptions.skipErrors);
      formData.append('update_existing', importOptions.updateExisting);
      formData.append('enable_ai_enrichment', importOptions.enableAiEnrichment);
      formData.append('business_id', businessInfo?.id || 1);

      const response = await axios.post(`${API_BASE}/inventory/csv/import`, formData);

      if (response.data.success) {
        setActiveStep(3);
        setTimeout(() => {
          onSuccess(response.data.data);
          handleClose();
        }, 2000);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setActiveStep(0);
    setCsvFile(null);
    setCsvData(null);
    setColumnMapping({});
    setValidationResults(null);
    setError(null);
    onClose();
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await axios.get(
        `${API_BASE}/inventory/csv/template?business_type=${businessInfo?.type || 'General'}`,
        { responseType: 'blob' }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'inventory_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError('Failed to download template');
    }
  };

  const renderUploadStep = () => (
    <Box sx={{ mt: 2 }}>
      <Box
        {...getRootProps()}
        sx={{
          border: '2px dashed var(--border)',
          borderRadius: 2,
          p: 4,
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: isDragActive ? 'var(--muted)' : 'var(--background)',
          '&:hover': { backgroundColor: 'var(--muted)' }
        }}
      >
        <input {...getInputProps()} />
        <CloudUploadIcon sx={{ fontSize: 48, color: 'var(--muted-foreground)', mb: 2 }} />
        <Typography variant="h6" gutterBottom>
          {isDragActive ? 'Drop the CSV file here' : 'Drag & drop CSV file here'}
        </Typography>
        <Typography variant="body2" color="textSecondary">
          or click to select file
        </Typography>
      </Box>

      {csvFile && (
        <Alert severity="success" sx={{ mt: 2 }}>
          File uploaded: {csvFile.name} ({(csvFile.size / 1024).toFixed(2)} KB)
        </Alert>
      )}

      <Button
        variant="outlined"
        onClick={handleDownloadTemplate}
        sx={{ mt: 2 }}
        fullWidth
      >
        Download CSV Template
      </Button>
    </Box>
  );

  const renderColumnMapping = () => (
    <Box sx={{ mt: 2 }}>
      <Typography variant="body2" gutterBottom>
        Map your CSV columns to system fields
      </Typography>
      
      <TableContainer component={Paper} sx={{
        mt: 2,
        maxHeight: 300,
        backgroundColor: 'var(--sidebar)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        '& .MuiTableCell-root': { color: 'var(--foreground)', borderColor: 'var(--border)' },
        '& .MuiTableHead-root .MuiTableCell-root': { backgroundColor: 'var(--muted)' }
      }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>CSV Column</TableCell>
              <TableCell>Map To</TableCell>
              <TableCell>Preview Data</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {csvData?.columns?.map((column) => (
              <TableRow key={column}>
                <TableCell>{column}</TableCell>
                <TableCell>
                  <FormControl size="small" fullWidth>
                    <Select
                      value={columnMapping[column] || ''}
                      onChange={(e) => setColumnMapping({
                        ...columnMapping,
                        [column]: e.target.value
                      })}
                      MenuProps={{ PaperProps: { sx: { backgroundColor: 'var(--sidebar)', color: 'var(--foreground)', border: '1px solid var(--border)' } } }}
                    >
                      <MenuItem value="">Skip</MenuItem>
                      {systemFields.map(field => {
                        const alreadyUsed = Object.keys(columnMapping).some(
                          (k) => k !== column && columnMapping[k] === field
                        );
                        return (
                          <MenuItem key={field} value={field} disabled={alreadyUsed}>
                            {field.replace('_', ' ').toUpperCase()}
                          </MenuItem>
                        );
                      })}
                    </Select>
                  </FormControl>
                </TableCell>
                <TableCell>
                  <Typography variant="caption">
                    {csvData?.preview_data?.[0]?.[column] || '-'}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ mt: 2 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={importOptions.enableAiEnrichment}
              onChange={(e) => setImportOptions({
                ...importOptions,
                enableAiEnrichment: e.target.checked
              })}
            />
          }
          label="Enable AI enrichment (auto-generate SKUs, categories, stock levels)"
        />
      </Box>
    </Box>
  );

  const renderValidation = () => (
    <Box sx={{ mt: 2 }}>
      {validationResults && (
        <>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Chip
              icon={<CheckCircleIcon />}
              label={`${validationResults.valid_rows?.length || 0} Valid`}
              color="success"
              variant="outlined"
            />
            {validationResults.error_rows?.length > 0 && (
              <Chip
                icon={<ErrorIcon />}
                label={`${validationResults.error_rows.length} Errors`}
                color="error"
                variant="outlined"
              />
            )}
            {validationResults.warning_rows?.length > 0 && (
              <Chip
                icon={<WarningIcon />}
                label={`${validationResults.warning_rows.length} Warnings`}
                color="warning"
                variant="outlined"
              />
            )}
          </Box>

          {validationResults.error_rows?.length > 0 && (
            <Alert severity="error" sx={{ mb: 2 }}>
              <Typography variant="subtitle2">Errors found:</Typography>
              {validationResults.error_rows.slice(0, 3).map((error, idx) => (
                <Typography key={idx} variant="caption" display="block">
                  Row {error.row}: {error.errors.join(', ')}
                </Typography>
              ))}
              {validationResults.error_rows.length > 3 && (
                <Typography variant="caption">
                  ...and {validationResults.error_rows.length - 3} more
                </Typography>
              )}
            </Alert>
          )}

          <FormControlLabel
            control={
              <Checkbox
                checked={importOptions.skipErrors}
                onChange={(e) => setImportOptions({
                  ...importOptions,
                  skipErrors: e.target.checked
                })}
              />
            }
            label="Skip rows with errors and import valid rows only"
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={importOptions.updateExisting}
                onChange={(e) => setImportOptions({
                  ...importOptions,
                  updateExisting: e.target.checked
                })}
              />
            }
            label="Update existing items (match by SKU)"
          />
        </>
      )}
    </Box>
  );

  const renderSuccess = () => (
    <Box sx={{ textAlign: 'center', mt: 4 }}>
      <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
      <Typography variant="h6" gutterBottom>
        Import Successful!
      </Typography>
      <Typography variant="body2" color="textSecondary">
        Your inventory data has been imported successfully.
      </Typography>
    </Box>
  );

  const getStepContent = () => {
    switch (activeStep) {
      case 0:
        return renderUploadStep();
      case 1:
        return renderColumnMapping();
      case 2:
        return renderValidation();
      case 3:
        return renderSuccess();
      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (activeStep) {
      case 0:
        return csvFile !== null;
      case 1:
        return Object.keys(columnMapping).some(key => columnMapping[key]);
      case 2:
        return validationResults?.valid_rows?.length > 0;
      default:
        return false;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { backgroundColor: 'var(--card)', color: 'var(--card-foreground)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: '0 12px 30px rgba(0,0,0,0.35)' } }}
    >
      <DialogTitle sx={{ bgcolor: 'var(--card)', color: 'var(--card-foreground)', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: '1.1rem' }}>
        Import Inventory from CSV
        <IconButton
          onClick={handleClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent sx={{ bgcolor: 'var(--card)' }}>
        <Stepper activeStep={activeStep} sx={{ mb: 3, '& .MuiStepLabel-label': { color: 'var(--muted-foreground)' }, '& .Mui-active .MuiStepLabel-label': { color: 'var(--foreground)', fontWeight: 600 }, '& .Mui-completed .MuiStepLabel-label': { color: 'var(--foreground)' }, '& .MuiStepIcon-root.Mui-active': { color: 'var(--primary)' }, '& .MuiStepIcon-root.Mui-completed': { color: 'var(--primary)' } }}>
          {steps.map(label => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading && <LinearProgress sx={{ mb: 2 }} />}

        {getStepContent()}
      </DialogContent>

      <DialogActions sx={{ bgcolor: 'var(--card)', borderTop: '1px solid var(--border)' }}>
        {activeStep > 0 && activeStep < 3 && (
          <Button onClick={() => setActiveStep(prev => prev - 1)}>
            Back
          </Button>
        )}
        
        {activeStep === 0 && (
          <Button
            variant="contained"
            disabled={!canProceed() || loading}
            onClick={() => setActiveStep(1)}
            sx={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', boxShadow: '0 4px 12px rgba(224,93,56,0.35)', '&:hover': { backgroundColor: 'var(--primary)', opacity: 0.9 } }}
          >
            Next
          </Button>
        )}
        
        {activeStep === 1 && (
          <Button
            variant="contained"
            disabled={!canProceed() || loading}
            onClick={handleValidate}
            sx={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', boxShadow: '0 4px 12px rgba(224,93,56,0.35)', '&:hover': { backgroundColor: 'var(--primary)', opacity: 0.9 } }}
          >
            Validate
          </Button>
        )}
        
        {activeStep === 2 && (
          <Button
            variant="contained"
            disabled={!canProceed() || loading}
            onClick={handleImport}
            color="primary"
            sx={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', boxShadow: '0 4px 12px rgba(224,93,56,0.35)', '&:hover': { backgroundColor: 'var(--primary)', opacity: 0.9 } }}
          >
            Import
          </Button>
        )}
        
        {activeStep === 3 && (
          <Button variant="contained" onClick={handleClose} sx={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)', boxShadow: '0 4px 12px rgba(224,93,56,0.35)', '&:hover': { backgroundColor: 'var(--primary)', opacity: 0.9 } }}>
            Close
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default CSVUploadModal;
