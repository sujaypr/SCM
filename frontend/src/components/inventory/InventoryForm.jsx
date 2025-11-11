import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

const InventoryForm = ({ open, onClose, onSubmit, item = null, categories = [] }) => {
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    sku: '',
    current_stock: 0,
    min_stock_level: 10,
    max_stock_level: 100
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name || '',
        category: item.category || '',
        sku: item.sku || '',
        current_stock: item.current_stock || 0,
        min_stock_level: item.min_stock_level || 10,
        max_stock_level: item.max_stock_level || 100
      });
    } else {
      setFormData({
        name: '',
        category: '',
        sku: '',
        current_stock: 0,
        min_stock_level: 10,
        max_stock_level: 100
      });
    }
    setErrors({});
  }, [item]);

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const validate = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Product name is required';
    }
    
    if (!formData.current_stock && formData.current_stock !== 0) {
      newErrors.current_stock = 'Current stock is required';
    }
    
    if (formData.min_stock_level >= formData.max_stock_level) {
      newErrors.min_stock_level = 'Min stock must be less than max stock';
      newErrors.max_stock_level = 'Max stock must be greater than min stock';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      return;
    }
    
    setLoading(true);
    try {
      // Clean up data
      const submitData = {
        ...formData,
        current_stock: parseInt(formData.current_stock) || 0,
        min_stock_level: parseInt(formData.min_stock_level) || 10,
        max_stock_level: parseInt(formData.max_stock_level) || 100
      };
      
      // Remove empty strings
      Object.keys(submitData).forEach(key => {
        if (submitData[key] === '') {
          submitData[key] = null;
        }
      });
      
      await onSubmit(submitData);
      handleClose();
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: '',
      category: '',
      sku: '',
      current_stock: 0,
      min_stock_level: 10,
      max_stock_level: 100
    });
    setErrors({});
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { backgroundColor: 'var(--card)', color: 'var(--card-foreground)', border: '1px solid var(--border)' } }}
    >
      <DialogTitle sx={{ bgcolor: 'var(--card)', color: 'var(--card-foreground)', borderBottom: '1px solid var(--border)' }}>
        {item ? 'Edit Inventory Item' : 'Add New Item'}
        <IconButton
          onClick={handleClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent
        dividers
        sx={{
          bgcolor: 'var(--card)'
          , '& .MuiInputBase-root': { color: 'var(--foreground)' }
          , '& .MuiInputBase-input': { color: 'var(--foreground)' }
          , '& .MuiOutlinedInput-root fieldset': { borderColor: 'var(--border)' }
          , '& .MuiOutlinedInput-root:hover fieldset': { borderColor: 'var(--ring)' }
          , '& .MuiOutlinedInput-root.Mui-focused fieldset': { borderColor: 'var(--ring)' }
          , '& .MuiFormLabel-root': { color: 'var(--muted-foreground)' }
          , '& .MuiFormLabel-root.Mui-focused': { color: 'var(--foreground)' }
          , '& .MuiSelect-icon': { color: 'var(--muted-foreground)' }
        }}
      >
        <Grid container spacing={2}>
          {/* Product Information */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Product Name"
              value={formData.name}
              onChange={handleChange('name')}
              error={!!errors.name}
              helperText={errors.name}
              required
            />
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={formData.category}
                onChange={handleChange('category')}
                label="Category"
                MenuProps={{ PaperProps: { sx: { backgroundColor: 'var(--sidebar)', color: 'var(--foreground)', border: '1px solid var(--border)' } } }}
              >
                <MenuItem value="">None</MenuItem>
                {categories.map(cat => (
                  <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                ))}
                <MenuItem value="_new">+ Add New Category</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="SKU"
              value={formData.sku}
              onChange={handleChange('sku')}
              placeholder="Auto-generated if empty"
            />
          </Grid>
          
          {/* Stock Information */}
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Current Stock"
              type="number"
              value={formData.current_stock}
              onChange={handleChange('current_stock')}
              error={!!errors.current_stock}
              helperText={errors.current_stock}
              required
              inputProps={{ min: 0 }}
            />
          </Grid>
          
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Min Stock Level"
              type="number"
              value={formData.min_stock_level}
              onChange={handleChange('min_stock_level')}
              error={!!errors.min_stock_level}
              helperText={errors.min_stock_level}
              inputProps={{ min: 0 }}
            />
          </Grid>
          
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              label="Max Stock Level"
              type="number"
              value={formData.max_stock_level}
              onChange={handleChange('max_stock_level')}
              error={!!errors.max_stock_level}
              helperText={errors.max_stock_level}
              inputProps={{ min: 1 }}
            />
          </Grid>
        </Grid>
      </DialogContent>
      
      <DialogActions sx={{ bgcolor: 'var(--card)', borderTop: '1px solid var(--border)' }}>
        <Button onClick={handleClose}>Cancel</Button>
        <Button 
          variant="contained" 
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Saving...' : (item ? 'Update' : 'Add')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default InventoryForm;
