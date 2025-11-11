import React, { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Grid,
  Box,
  LinearProgress,
  Chip,
  Paper
} from '@mui/material';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

// Register ChartJS components
ChartJS.register(
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const InventoryStats = ({ analytics, items }) => {
  const [chartData, setChartData] = useState({
    statusChart: null,
    categoryChart: null,
    valueChart: null
  });

  useEffect(() => {
    if (analytics) {
      // Status distribution chart
      const statusData = {
        labels: ['Critical', 'Low', 'Normal', 'Overstock'],
        datasets: [{
          data: [
            analytics.status_breakdown?.critical || 0,
            analytics.status_breakdown?.low || 0,
            analytics.status_breakdown?.normal || 0,
            analytics.status_breakdown?.overstock || 0
          ],
          backgroundColor: [
            '#f44336',
            '#ff9800',
            '#4caf50',
            '#2196f3'
          ],
          borderWidth: 0
        }]
      };

      // Category value distribution
      const topCategories = analytics.top_categories || [];
      const categoryData = {
        labels: topCategories.map(cat => cat[0]),
        datasets: [{
          label: 'Inventory Value',
          data: topCategories.map(cat => cat[1].value),
          backgroundColor: '#3f51b5',
          borderRadius: 4
        }]
      };

      // Value trend (mock data for now)
      const valueData = {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [{
          label: 'Inventory Value',
          data: [85000, 92000, 88000, 95000, 98000, analytics.total_value || 0],
          borderColor: '#3f51b5',
          backgroundColor: 'rgba(63, 81, 181, 0.1)',
          tension: 0.4
        }]
      };

      setChartData({
        statusChart: statusData,
        categoryChart: categoryData,
        valueChart: valueData
      });
    }
  }, [analytics]);

  if (!analytics) {
    return (
      <Box sx={{ width: '100%' }}>
        <LinearProgress />
      </Box>
    );
  }

  const formatCurrency = (value) => {
    if (!value) return '₹0';
    return `₹${value.toLocaleString('en-IN')}`;
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          padding: 10
        }
      }
    }
  };

  return (
    <Grid container spacing={3}>
      {/* Summary Cards */}
      <Grid item xs={12} md={3}>
        <Paper elevation={2} sx={{ p: 2, height: '100%' }}>
          <Typography variant="subtitle2" color="textSecondary" gutterBottom>
            Total Inventory Value
          </Typography>
          <Typography variant="h5" fontWeight="bold">
            {formatCurrency(analytics.total_value)}
          </Typography>
          <Typography variant="caption" color="success.main">
            +12.5% from last month
          </Typography>
        </Paper>
      </Grid>

      <Grid item xs={12} md={3}>
        <Paper elevation={2} sx={{ p: 2, height: '100%' }}>
          <Typography variant="subtitle2" color="textSecondary" gutterBottom>
            Carrying Cost
          </Typography>
          <Typography variant="h5" fontWeight="bold">
            {formatCurrency(analytics.carrying_cost)}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            15% of inventory value
          </Typography>
        </Paper>
      </Grid>

      <Grid item xs={12} md={3}>
        <Paper elevation={2} sx={{ p: 2, height: '100%' }}>
          <Typography variant="subtitle2" color="textSecondary" gutterBottom>
            Turnover Rate
          </Typography>
          <Typography variant="h5" fontWeight="bold">
            {analytics.turnover_rate?.toFixed(1) || '0'}x
          </Typography>
          <Chip 
            label="Good" 
            color="success" 
            size="small" 
            sx={{ mt: 0.5 }}
          />
        </Paper>
      </Grid>

      <Grid item xs={12} md={3}>
        <Paper elevation={2} sx={{ p: 2, height: '100%' }}>
          <Typography variant="subtitle2" color="textSecondary" gutterBottom>
            Reorder Alerts
          </Typography>
          <Typography variant="h5" fontWeight="bold" color="warning.main">
            {analytics.reorder_alerts || 0}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            Items needing reorder
          </Typography>
        </Paper>
      </Grid>

      {/* Charts */}
      <Grid item xs={12} md={4}>
        <Card sx={{ height: 300 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Stock Status Distribution
            </Typography>
            <Box sx={{ height: 200, position: 'relative' }}>
              {chartData.statusChart && (
                <Doughnut 
                  data={chartData.statusChart} 
                  options={chartOptions}
                />
              )}
            </Box>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={4}>
        <Card sx={{ height: 300 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Top Categories by Value
            </Typography>
            <Box sx={{ height: 200, position: 'relative' }}>
              {chartData.categoryChart && (
                <Bar 
                  data={chartData.categoryChart} 
                  options={{
                    ...chartOptions,
                    scales: {
                      y: {
                        beginAtZero: true,
                        ticks: {
                          callback: function(value) {
                            return '₹' + value.toLocaleString('en-IN');
                          }
                        }
                      }
                    }
                  }}
                />
              )}
            </Box>
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={4}>
        <Card sx={{ height: 300 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Value Trend
            </Typography>
            <Box sx={{ height: 200, position: 'relative' }}>
              {chartData.valueChart && (
                <Line 
                  data={chartData.valueChart} 
                  options={{
                    ...chartOptions,
                    scales: {
                      y: {
                        beginAtZero: false,
                        ticks: {
                          callback: function(value) {
                            return '₹' + (value/1000).toFixed(0) + 'k';
                          }
                        }
                      }
                    }
                  }}
                />
              )}
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Category Breakdown Table */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Category Analysis
            </Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Category</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>Items</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Total Value</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Avg Value/Item</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>Stock Health</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(analytics.category_breakdown || {}).map(([category, data]) => {
                    const categoryItems = items.filter(item => item.category === category);
                    const lowStockCount = categoryItems.filter(item => 
                      item.status === 'low' || item.status === 'critical'
                    ).length;
                    
                    return (
                      <tr key={category} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '12px' }}>{category}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>{data.items}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          {formatCurrency(data.value)}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          {formatCurrency(data.items > 0 ? data.value / data.items : 0)}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          {lowStockCount > 0 ? (
                            <Chip 
                              label={`${lowStockCount} low`} 
                              color="warning" 
                              size="small" 
                            />
                          ) : (
                            <Chip 
                              label="Healthy" 
                              color="success" 
                              size="small" 
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

export default InventoryStats;
