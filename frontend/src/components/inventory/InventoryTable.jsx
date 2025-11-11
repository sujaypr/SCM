import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  Paper,
  IconButton,
  Chip,
  TextField,
  Tooltip,
  Box,
  Typography,
  Checkbox,
  Toolbar,
  alpha
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import FileDownloadIcon from '@mui/icons-material/FileDownload';

const InventoryTable = ({
  items,
  onEdit,
  onDelete,
  onStockAdjust,
  onSelectItems,
  selectedItems = [],
  loading = false
}) => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [orderBy, setOrderBy] = useState('name');
  const [order, setOrder] = useState('asc');
  const [searchTerm, setSearchTerm] = useState('');

  // Status color mapping
  const getStatusColor = (status) => {
    switch (status) {
      case 'critical':
        return 'error';
      case 'low':
        return 'warning';
      case 'normal':
        return 'success';
      case 'overstock':
        return 'info';
      default:
        return 'default';
    }
  };

  // Format currency
  const formatCurrency = (value) => {
    if (!value) return '-';
    return `₹${value.toLocaleString('en-IN')}`;
  };

  // Handle sorting
  const handleSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  // Sort function
  const sortData = (data) => {
    return data.sort((a, b) => {
      let aVal = a[orderBy];
      let bVal = b[orderBy];
      
      // Handle null/undefined values
      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';
      
      // Convert to lowercase for string comparison
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      
      if (order === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });
  };

  // Filter function
  const filterData = (data) => {
    if (!searchTerm) return data;
    
    const term = searchTerm.toLowerCase();
    return data.filter(item => 
      item.name?.toLowerCase().includes(term) ||
      item.sku?.toLowerCase().includes(term) ||
      item.category?.toLowerCase().includes(term) ||
      item.supplier?.toLowerCase().includes(term)
    );
  };

  // Process data
  const processedData = sortData(filterData(items || []));
  const paginatedData = processedData.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  // Handle select all
  const handleSelectAll = (event) => {
    if (event.target.checked) {
      const newSelected = processedData.map(item => item.id);
      onSelectItems?.(newSelected);
    } else {
      onSelectItems?.([]);
    }
  };

  // Handle individual select
  const handleSelect = (id) => {
    const selectedIndex = selectedItems.indexOf(id);
    let newSelected = [];

    if (selectedIndex === -1) {
      newSelected = newSelected.concat(selectedItems, id);
    } else if (selectedIndex === 0) {
      newSelected = newSelected.concat(selectedItems.slice(1));
    } else if (selectedIndex === selectedItems.length - 1) {
      newSelected = newSelected.concat(selectedItems.slice(0, -1));
    } else if (selectedIndex > 0) {
      newSelected = newSelected.concat(
        selectedItems.slice(0, selectedIndex),
        selectedItems.slice(selectedIndex + 1)
      );
    }

    onSelectItems?.(newSelected);
  };

  const isSelected = (id) => selectedItems.indexOf(id) !== -1;

  return (
    <Paper sx={{ width: '100%', overflow: 'hidden' }}>
      {/* Toolbar with search */}
      <Toolbar
        sx={{
          pl: { sm: 2 },
          pr: { xs: 1, sm: 1 },
          ...(selectedItems.length > 0 && {
            bgcolor: (theme) =>
              alpha(theme.palette.primary.main, theme.palette.action.activatedOpacity),
          }),
        }}
      >
        {selectedItems.length > 0 ? (
          <Typography
            sx={{ flex: '1 1 100%' }}
            color="inherit"
            variant="subtitle1"
            component="div"
          >
            {selectedItems.length} selected
          </Typography>
        ) : (
          <TextField
            variant="outlined"
            size="small"
            placeholder="Search inventory..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ flex: '1 1 100%', maxWidth: 400 }}
          />
        )}
        
        {selectedItems.length > 0 && (
          <Tooltip title="Export Selected">
            <IconButton>
              <FileDownloadIcon />
            </IconButton>
          </Tooltip>
        )}
      </Toolbar>

      {/* Table */}
      <TableContainer sx={{ maxHeight: 600 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={selectedItems.length > 0 && selectedItems.length < processedData.length}
                  checked={processedData.length > 0 && selectedItems.length === processedData.length}
                  onChange={handleSelectAll}
                />
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={orderBy === 'name'}
                  direction={orderBy === 'name' ? order : 'asc'}
                  onClick={() => handleSort('name')}
                >
                  Product Name
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={orderBy === 'category'}
                  direction={orderBy === 'category' ? order : 'asc'}
                  onClick={() => handleSort('category')}
                >
                  Category
                </TableSortLabel>
              </TableCell>
              <TableCell>SKU</TableCell>
              <TableCell align="center">
                <TableSortLabel
                  active={orderBy === 'current_stock'}
                  direction={orderBy === 'current_stock' ? order : 'asc'}
                  onClick={() => handleSort('current_stock')}
                >
                  Stock
                </TableSortLabel>
              </TableCell>
              <TableCell align="center">Min/Max</TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={orderBy === 'unit_cost'}
                  direction={orderBy === 'unit_cost' ? order : 'asc'}
                  onClick={() => handleSort('unit_cost')}
                >
                  Cost
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={orderBy === 'selling_price'}
                  direction={orderBy === 'selling_price' ? order : 'asc'}
                  onClick={() => handleSort('selling_price')}
                >
                  Price
                </TableSortLabel>
              </TableCell>
              <TableCell align="center">Status</TableCell>
              <TableCell>Supplier</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedData.map((item) => {
              const isItemSelected = isSelected(item.id);
              
              return (
                <TableRow
                  key={item.id}
                  hover
                  role="checkbox"
                  aria-checked={isItemSelected}
                  selected={isItemSelected}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={isItemSelected}
                      onChange={() => handleSelect(item.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="500">
                      {item.name}
                    </Typography>
                    {item.description && (
                      <Typography variant="caption" color="textSecondary">
                        {item.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{item.category || '-'}</TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                      {item.sku || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <IconButton 
                        size="small" 
                        onClick={() => onStockAdjust?.(item.id, -1)}
                        disabled={item.current_stock <= 0}
                      >
                        <RemoveIcon fontSize="small" />
                      </IconButton>
                      <Typography variant="body2" sx={{ minWidth: 40, textAlign: 'center' }}>
                        {item.current_stock}
                      </Typography>
                      <IconButton 
                        size="small" 
                        onClick={() => onStockAdjust?.(item.id, 1)}
                      >
                        <AddIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="caption">
                      {item.min_stock_level}/{item.max_stock_level}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{formatCurrency(item.unit_cost)}</TableCell>
                  <TableCell align="right">
                    {formatCurrency(item.selling_price)}
                    {item.markup_percentage && (
                      <Typography variant="caption" color="success.main" display="block">
                        {item.markup_percentage.toFixed(1)}%
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={item.status}
                      color={getStatusColor(item.status)}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>{item.supplier || '-'}</TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => onEdit?.(item)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton 
                          size="small" 
                          color="error"
                          onClick={() => onDelete?.(item.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
            
            {processedData.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} align="center">
                  <Typography variant="body1" color="textSecondary" sx={{ py: 3 }}>
                    No inventory items found
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      <TablePagination
        rowsPerPageOptions={[5, 10, 25, 50]}
        component="div"
        count={processedData.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={(event, newPage) => setPage(newPage)}
        onRowsPerPageChange={(event) => {
          setRowsPerPage(parseInt(event.target.value, 10));
          setPage(0);
        }}
      />
    </Paper>
  );
};

export default InventoryTable;
