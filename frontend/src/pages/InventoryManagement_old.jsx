import React, { useState, useContext } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { BusinessInfoContext } from '../context/BusinessInfoContext';
import useInventory from '../hooks/useInventory';

const InventoryManagement = () => {
  const { businessInfo } = useContext(BusinessInfoContext);
  const businessId = businessInfo?.id || 1;
  
  // Use inventory hook
  const {
    items,
    loading,
    error,
    analytics,
    categories,
    fetchInventory,
    addItem,
    updateItem,
    deleteItem,
    adjustStock,
    exportToCSV,
    totalItems,
    totalValue,
    lowStockCount
  } = useInventory(businessId);

  // Local state
  const [filters, setFilters] = useState({
    category: '',
    status: '',
    search: ''
  });
  const [selectedItems, setSelectedItems] = useState([]);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, itemId: null });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Handle filter changes
  const handleFilterChange = (field, value) => {
    const newFilters = { ...filters, [field]: value };
    setFilters(newFilters);
    fetchInventory(newFilters);
  };

  // Handle form submission
  const handleFormSubmit = async (formData) => {
    try {
      if (editingItem) {
        await updateItem(editingItem.id, formData);
        setSnackbar({ open: true, message: 'Item updated successfully', severity: 'success' });
      } else {
        await addItem(formData);
        setSnackbar({ open: true, message: 'Item added successfully', severity: 'success' });
      }
      setFormModalOpen(false);
      setEditingItem(null);
    } catch (error) {
      setSnackbar({ open: true, message: error.message, severity: 'error' });
    }
  };

  // Handle delete
  const handleDelete = async () => {
    try {
      await deleteItem(deleteDialog.itemId);
      setSnackbar({ open: true, message: 'Item deleted successfully', severity: 'success' });
      setDeleteDialog({ open: false, itemId: null });
    } catch (error) {
      setSnackbar({ open: true, message: error.message, severity: 'error' });
    }
  };

  // Handle stock adjustment
  const handleStockAdjust = async (itemId, adjustment) => {
    try {
      await adjustStock(itemId, adjustment);
      setSnackbar({ open: true, message: 'Stock adjusted successfully', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: error.message, severity: 'error' });
    }
  };

  // Handle CSV import success
  const handleCSVImportSuccess = (result) => {
    setCsvModalOpen(false);
    fetchInventory();
    setSnackbar({ 
      open: true, 
      message: `Successfully imported ${result.imported} items`, 
      severity: 'success' 
    });
  };

  // Handle export
  const handleExport = async () => {
    try {
      await exportToCSV(filters);
      setSnackbar({ open: true, message: 'Exported successfully', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: error.message, severity: 'error' });
    }
  };

  // Get status color classes
  const getStatusColor = (status) => {
    switch(status) {
      case 'critical': return 'bg-red-100 text-red-600';
      case 'low': return 'bg-orange-100 text-orange-500';
      case 'normal': return 'bg-green-100 text-green-600';
      case 'overstock': return 'bg-blue-100 text-blue-600';
      default: return 'bg-gray-200 text-gray-700';
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6">
      {/* Header */}
      <div className="mb-8 text-left">
        <h2 className="flex items-center gap-2 text-2xl font-semibold text-[--foreground] mb-1">
          <i className="fas fa-boxes text-[--primary]"></i>
          Inventory Management
        </h2>
        <p className="text-[--muted-foreground] text-base">Monitor and optimize your inventory levels</p>
      </div>

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Items
              </Typography>
              <Typography variant="h4">
                {totalItems}
              </Typography>
              <Typography variant="body2" color="primary">
                ₹{totalValue.toLocaleString('en-IN')} total value
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Critical Stock
              </Typography>
              <Typography variant="h4" color="error">
                {items.filter(item => item.status === 'critical').length}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Immediate action needed
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Low Stock
              </Typography>
              <Typography variant="h4" color="warning.main">
                {items.filter(item => item.status === 'low').length}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Reorder soon
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Healthy Stock
              </Typography>
              <Typography variant="h4" color="success.main">
                {items.filter(item => item.status === 'normal').length}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Optimal levels
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters and Actions */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', flex: 1 }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={filters.category}
              label="Category"
              onChange={(e) => handleFilterChange('category', e.target.value)}
            >
              <MenuItem value="">All Categories</MenuItem>
              {categories.map(cat => (
                <MenuItem key={cat} value={cat}>{cat}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={filters.status}
              label="Status"
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <MenuItem value="">All Status</MenuItem>
              <MenuItem value="critical">Critical</MenuItem>
              <MenuItem value="low">Low Stock</MenuItem>
              <MenuItem value="normal">Normal</MenuItem>
              <MenuItem value="overstock">Overstock</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            placeholder="Search items..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              )
            }}
            sx={{ minWidth: 200 }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Refresh">
            <IconButton onClick={() => fetchInventory(filters)}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="outlined"
            startIcon={<FileDownloadIcon />}
            onClick={handleExport}
          >
            Export
          </Button>
          <Button
            variant="outlined"
            startIcon={<FileUploadIcon />}
            onClick={() => setCsvModalOpen(true)}
          >
            Import CSV
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditingItem(null);
              setFormModalOpen(true);
            }}
          >
            Add Item
          </Button>
        </Box>
      </Box>

      {/* Main Content */}
      {loading && !items.length ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      ) : items.length === 0 ? (
        <Card sx={{ p: 6, textAlign: 'center' }}>
          <InventoryIcon sx={{ fontSize: 64, color: 'action.disabled', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            No inventory items found
          </Typography>
          <Typography variant="body1" color="textSecondary" sx={{ mb: 3 }}>
            Start by adding your first inventory item or importing from CSV
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setEditingItem(null);
                setFormModalOpen(true);
              }}
            >
              Add First Item
            </Button>
            <Button
              variant="outlined"
              startIcon={<FileUploadIcon />}
              onClick={() => setCsvModalOpen(true)}
            >
              Import CSV
            </Button>
          </Box>
        </Card>
      ) : (
        <InventoryTable
          items={items}
          selectedItems={selectedItems}
          onSelectItems={setSelectedItems}
          onEdit={(item) => {
            setEditingItem(item);
            setFormModalOpen(true);
          }}
          onDelete={(itemId) => {
            setDeleteDialog({ open: true, itemId });
          }}
          onStockAdjust={handleStockAdjust}
          loading={loading}
        />
      )}

      {/* Modals */}
      <CSVUploadModal
        open={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        onSuccess={handleCSVImportSuccess}
        businessInfo={businessInfo}
      />

      <InventoryForm
        open={formModalOpen}
        onClose={() => {
          setFormModalOpen(false);
          setEditingItem(null);
        }}
        onSubmit={handleFormSubmit}
        item={editingItem}
        categories={categories}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, itemId: null })}
      >
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete this item?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, itemId: null })}>
            Cancel
          </Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default InventoryManagement;