const ExportModule = (function() {
    function exportCSV() {
        const orders = Store.getWorkOrders();
        const lines = Store.getLines();
        
        const lineNames = {};
        lines.forEach(l => lineNames[l.id] = l.name);
        
        const headers = ['工单编号', '产品型号', '数量', '标准工时(分钟)', '交货日期', '分配产线', '开始时间', '结束时间', '状态'];
        
        const rows = orders.map((order, index) => {
            const lineName = order.lineId ? lineNames[order.lineId] : '待排程';
            const startTime = order.startMinute !== null ? Utils.formatMinutes(order.startMinute) : '-';
            const endTime = order.startMinute !== null ? Utils.formatMinutes(order.startMinute + order.stdMinutes) : '-';
            const status = Utils.isOverdue(order.dueDate) ? '逾期' : (order.lineId ? '已排程' : '待排程');
            
            return [
                `WO${(index + 1).toString().padStart(4, '0')}`,
                order.productModel,
                order.quantity,
                order.stdMinutes,
                order.dueDate,
                lineName,
                startTime,
                endTime,
                status
            ];
        });
        
        let csvContent = '\uFEFF';
        csvContent += headers.join(',') + '\n';
        rows.forEach(row => {
            csvContent += row.map(cell => `"${cell}"`).join(',') + '\n';
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        const scheme = Store.getCurrentScheme();
        const fileName = scheme ? `排程表_${scheme.name}_${Utils.getTodayDateStr()}.csv` : `排程表_${Utils.getTodayDateStr()}.csv`;
        
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        Utils.showToast('CSV导出成功', 'success');
    }

    function exportPDF() {
        const scheme = Store.getCurrentScheme();
        const title = scheme ? `排程表 - ${scheme.name}` : '排程表';
        
        const printWindow = window.open('', '_blank');
        
        const orders = Store.getWorkOrders();
        const lines = Store.getLines();
        
        let orderRows = '';
        orders.forEach((order, index) => {
            const line = lines.find(l => l.id === order.lineId);
            const lineName = line ? line.name : '待排程';
            const startTime = order.startMinute !== null ? Utils.formatMinutes(order.startMinute) : '-';
            const endTime = order.startMinute !== null ? Utils.formatMinutes(order.startMinute + order.stdMinutes) : '-';
            const isOverdue = Utils.isOverdue(order.dueDate);
            const statusClass = isOverdue ? 'status-overdue' : (order.lineId ? 'status-scheduled' : 'status-pending');
            const status = isOverdue ? '逾期' : (order.lineId ? '已排程' : '待排程');
            
            orderRows += `
                <tr>
                    <td>WO${(index + 1).toString().padStart(4, '0')}</td>
                    <td>${order.productModel}</td>
                    <td>${order.quantity}</td>
                    <td>${order.stdMinutes}</td>
                    <td>${order.dueDate}</td>
                    <td>${lineName}</td>
                    <td>${startTime}</td>
                    <td>${endTime}</td>
                    <td class="${statusClass}">${status}</td>
                </tr>
            `;
        });
        
        let loadRows = '';
        lines.forEach(line => {
            const load = Store.getLineLoad(line.id);
            let loadClass = 'load-low';
            if (load >= 90) loadClass = 'load-high';
            else if (load >= 70) loadClass = 'load-medium';
            
            loadRows += `
                <tr>
                    <td>${line.name}</td>
                    <td>
                        <div class="load-bar-print">
                            <div class="load-fill-print ${loadClass}" style="width: ${load}%"></div>
                        </div>
                    </td>
                    <td>${load.toFixed(1)}%</td>
                </tr>
            `;
        });
        
        const totalOrders = orders.length;
        const overdueCount = Store.getOverdueCount();
        const avgLoad = Store.getAvgLoad();
        
        const printContent = `
            <!DOCTYPE html>
            <html lang="zh-CN">
            <head>
                <meta charset="UTF-8">
                <title>${title}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Microsoft YaHei', sans-serif;
                        padding: 30px;
                        color: #333;
                        font-size: 12px;
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 20px;
                        padding-bottom: 15px;
                        border-bottom: 2px solid #333;
                    }
                    .header h1 {
                        font-size: 20px;
                        margin-bottom: 5px;
                    }
                    .header .date {
                        font-size: 12px;
                        color: #666;
                    }
                    .stats {
                        display: flex;
                        gap: 30px;
                        margin-bottom: 20px;
                    }
                    .stat-item {
                        flex: 1;
                        background: #f5f5f5;
                        padding: 10px;
                        border-radius: 4px;
                        text-align: center;
                    }
                    .stat-value {
                        font-size: 18px;
                        font-weight: bold;
                        color: #333;
                    }
                    .stat-label {
                        font-size: 11px;
                        color: #666;
                        margin-top: 3px;
                    }
                    .section-title {
                        font-size: 14px;
                        font-weight: bold;
                        margin: 15px 0 10px;
                        padding-left: 10px;
                        border-left: 4px solid #0099cc;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 15px;
                    }
                    th, td {
                        border: 1px solid #ddd;
                        padding: 8px 10px;
                        text-align: left;
                    }
                    th {
                        background: #f0f0f0;
                        font-weight: bold;
                        font-size: 12px;
                    }
                    tr:nth-child(even) {
                        background: #fafafa;
                    }
                    .status-overdue { color: #ff3b30; font-weight: bold; }
                    .status-scheduled { color: #34c759; }
                    .status-pending { color: #ff9500; }
                    .load-bar-print {
                        height: 8px;
                        background: #eee;
                        border-radius: 4px;
                        overflow: hidden;
                    }
                    .load-fill-print {
                        height: 100%;
                        border-radius: 4px;
                    }
                    .load-low { background: #34c759; }
                    .load-medium { background: #ff9500; }
                    .load-high { background: #ff3b30; }
                    .footer {
                        margin-top: 30px;
                        text-align: right;
                        font-size: 11px;
                        color: #999;
                    }
                    @media print {
                        body { padding: 20px; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${title}</h1>
                    <div class="date">导出日期：${new Date().toLocaleDateString('zh-CN')} ${new Date().toLocaleTimeString('zh-CN')}</div>
                </div>
                
                <div class="stats">
                    <div class="stat-item">
                        <div class="stat-value">${totalOrders}</div>
                        <div class="stat-label">总工单数</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" style="color: #ff3b30">${overdueCount}</div>
                        <div class="stat-label">逾期工单</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" style="color: #0099cc">${avgLoad.toFixed(1)}%</div>
                        <div class="stat-label">平均负载率</div>
                    </div>
                </div>
                
                <div class="section-title">产线负载情况</div>
                <table>
                    <thead>
                        <tr>
                            <th>产线</th>
                            <th>负载进度</th>
                            <th>负载率</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${loadRows}
                    </tbody>
                </table>
                
                <div class="section-title">工单明细</div>
                <table>
                    <thead>
                        <tr>
                            <th>工单编号</th>
                            <th>产品型号</th>
                            <th>数量</th>
                            <th>标准工时(分钟)</th>
                            <th>交货日期</th>
                            <th>分配产线</th>
                            <th>开始时间</th>
                            <th>结束时间</th>
                            <th>状态</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${orderRows}
                    </tbody>
                </table>
                
                <div class="footer">
                    本排程表由生产工单排程系统自动生成
                </div>
            </body>
            </html>
        `;
        
        printWindow.document.open();
        printWindow.document.write(printContent);
        printWindow.document.close();
        
        printWindow.onload = function() {
            setTimeout(() => {
                printWindow.print();
            }, 500);
        };
        
        Utils.showToast('打印预览已打开', 'success');
    }

    return {
        exportCSV,
        exportPDF
    };
})();
