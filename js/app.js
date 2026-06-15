const App = (function() {
    let currentCompareTab = 'moved';
    let currentCompareSchemeId = null;
    let compareShowChangedOnly = false;
    let editingOrderId = null;

    function init() {
        Store.init();
        Gantt.init();
        
        setupEventListeners();
        updateSchemeSelect();
        updateStatusStats();
        updateExecutionStats();
        Gantt.render();
        
        const dueDateInput = document.getElementById('dueDate');
        if (dueDateInput && !dueDateInput.value) {
            dueDateInput.value = Utils.getTodayDateStr();
        }
    }

    function setupEventListeners() {
        document.getElementById('btnAddOrder').addEventListener('click', openAddModal);
        
        document.getElementById('modalClose').addEventListener('click', closeOrderModal);
        document.getElementById('btnCancel').addEventListener('click', closeOrderModal);
        document.getElementById('orderModal').addEventListener('click', (e) => {
            if (e.target.id === 'orderModal') closeOrderModal();
        });
        
        document.getElementById('orderForm').addEventListener('submit', handleOrderSubmit);
        
        document.getElementById('btnAutoSchedule').addEventListener('click', handleAutoSchedule);
        
        document.getElementById('btnExportCsv').addEventListener('click', ExportModule.exportCSV);
        document.getElementById('btnExportPdf').addEventListener('click', ExportModule.exportPDF);
        
        document.getElementById('schemeSelect').addEventListener('change', handleSchemeChange);
        
        document.getElementById('btnSaveScheme').addEventListener('click', openSaveSchemeModal);
        document.getElementById('btnDeleteScheme').addEventListener('click', handleDeleteScheme);
        document.getElementById('btnCopyScheme').addEventListener('click', handleCopyScheme);
        document.getElementById('btnCompareScheme').addEventListener('click', openCompareModal);
        
        document.getElementById('btnCancelSave').addEventListener('click', closeSaveSchemeModal);
        document.getElementById('btnConfirmSave').addEventListener('click', handleSaveScheme);
        document.getElementById('saveSchemeModal').addEventListener('click', (e) => {
            if (e.target.id === 'saveSchemeModal') closeSaveSchemeModal();
        });
        
        document.getElementById('btnCalendar').addEventListener('click', openCalendarModal);
        document.getElementById('btnCancelCalendar').addEventListener('click', closeCalendarModal);
        document.getElementById('btnSaveCalendar').addEventListener('click', handleSaveCalendar);
        document.getElementById('calendarModalClose').addEventListener('click', closeCalendarModal);
        document.getElementById('calendarModal').addEventListener('click', (e) => {
            if (e.target.id === 'calendarModal') closeCalendarModal();
        });
        document.getElementById('btnAddDowntime').addEventListener('click', openDowntimeModal);
        
        document.getElementById('shiftTypeSelect').addEventListener('change', handleShiftTypeChange);
        document.getElementById('btnAddBreak').addEventListener('click', openBreakModal);
        
        document.getElementById('btnCancelBreak').addEventListener('click', closeBreakModal);
        document.getElementById('btnConfirmBreak').addEventListener('click', handleConfirmBreak);
        document.getElementById('breakModal').addEventListener('click', (e) => {
            if (e.target.id === 'breakModal') closeBreakModal();
        });
        
        document.getElementById('btnCancelDowntime').addEventListener('click', closeDowntimeModal);
        document.getElementById('btnConfirmDowntime').addEventListener('click', handleConfirmDowntime);
        document.getElementById('downtimeModal').addEventListener('click', (e) => {
            if (e.target.id === 'downtimeModal') closeDowntimeModal();
        });
        
        document.getElementById('btnCloseCompare').addEventListener('click', closeCompareModal);
        document.getElementById('compareModalClose').addEventListener('click', closeCompareModal);
        document.getElementById('compareModal').addEventListener('click', (e) => {
            if (e.target.id === 'compareModal') closeCompareModal();
        });
        document.getElementById('compareSchemeSelect').addEventListener('change', handleCompareSchemeChange);
        document.getElementById('btnSwitchToCompare').addEventListener('click', handleSwitchToCompare);
        document.getElementById('chkShowChangedOnly').addEventListener('change', handleShowChangedOnly);
        
        document.querySelectorAll('.compare-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.compare-tab').forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                currentCompareTab = e.currentTarget.dataset.tab;
                renderCompareList();
            });
        });
        
        document.getElementById('timeScaleSelect').addEventListener('change', handleTimeScaleChange);
        
        document.getElementById('chkShowHistorical').addEventListener('change', (e) => {
            Gantt.setShowHistorical(e.target.checked);
            Gantt.render();
        });
        
        document.getElementById('btnAuditLog').addEventListener('click', openAuditLogModal);
        document.getElementById('auditLogModalClose').addEventListener('click', closeAuditLogModal);
        document.getElementById('btnCloseAuditLog').addEventListener('click', closeAuditLogModal);
        document.getElementById('auditLogModal').addEventListener('click', (e) => {
            if (e.target.id === 'auditLogModal') closeAuditLogModal();
        });
        document.getElementById('auditActionFilter').addEventListener('change', renderAuditLogList);
        
        document.getElementById('btnCloseExecution').addEventListener('click', closeExecutionModal);
        document.getElementById('executionModalClose').addEventListener('click', closeExecutionModal);
        document.getElementById('executionModal').addEventListener('click', (e) => {
            if (e.target.id === 'executionModal') closeExecutionModal();
        });
        document.getElementById('btnStartWork').addEventListener('click', handleStartWork);
        document.getElementById('btnCompleteWork').addEventListener('click', handleCompleteWork);
        document.getElementById('btnCancelWork').addEventListener('click', handleCancelWork);
        document.getElementById('btnSaveExecution').addEventListener('click', handleSaveExecution);
        document.getElementById('executionProgress').addEventListener('input', (e) => {
            document.getElementById('executionProgressValue').textContent = e.target.value + '%';
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeOrderModal();
                closeSaveSchemeModal();
                closeCalendarModal();
                closeCompareModal();
                closeDowntimeModal();
                closeBreakModal();
                closeAuditLogModal();
                closeExecutionModal();
                editingOrderId = null;
            }
        });
        
        window.openExecutionModal = openExecutionModal;
    }

    function openAddModal() {
        document.getElementById('modalTitle').textContent = '添加新工单';
        document.getElementById('orderForm').reset();
        document.getElementById('orderId').value = '';
        document.getElementById('dueDate').value = Utils.getTodayDateStr();
        document.getElementById('lineSelect').value = '';
        document.getElementById('statusSelect').value = 'pending';
        document.getElementById('statusGroup').style.display = 'none';
        document.getElementById('btnSubmitOrder').textContent = '确认添加';
        document.getElementById('orderModal').classList.add('active');
        document.getElementById('productModel').focus();
    }

    function openEditModal(orderId) {
        const order = Store.getWorkOrderById(orderId);
        if (!order) return;
        
        document.getElementById('modalTitle').textContent = '编辑工单';
        document.getElementById('orderId').value = order.id;
        document.getElementById('productModel').value = order.productModel;
        document.getElementById('quantity').value = order.quantity;
        document.getElementById('stdMinutes').value = order.stdMinutes;
        document.getElementById('dueDate').value = order.dueDate;
        document.getElementById('lineSelect').value = order.lineId || '';
        document.getElementById('statusSelect').value = order.status || 'pending';
        document.getElementById('statusGroup').style.display = 'block';
        document.getElementById('btnSubmitOrder').textContent = '确认修改';
        
        document.getElementById('orderModal').classList.add('active');
        document.getElementById('productModel').focus();
    }

    function closeOrderModal() {
        document.getElementById('orderModal').classList.remove('active');
    }

    function handleOrderSubmit(e) {
        e.preventDefault();
        
        const orderId = document.getElementById('orderId').value;
        const productModel = document.getElementById('productModel').value.trim();
        const quantity = parseInt(document.getElementById('quantity').value);
        const stdMinutes = parseInt(document.getElementById('stdMinutes').value);
        const dueDate = document.getElementById('dueDate').value;
        const lineId = document.getElementById('lineSelect').value || null;
        const status = document.getElementById('statusSelect').value || 'pending';
        
        if (!productModel || !quantity || !stdMinutes || !dueDate) {
            Utils.showToast('请填写所有必填项', 'error');
            return;
        }
        
        let startMinute = null;
        let dayOffset = 0;
        let segments = null;
        let finalLineId = lineId;
        let finalStatus = status;
        
        if (lineId) {
            const slot = Scheduler.findNextAvailableSlot(lineId, stdMinutes, orderId);
            
            if (slot) {
                startMinute = slot.startMinute;
                dayOffset = slot.dayOffset;
                segments = Store.splitOrderForMultiDay(
                    { stdMinutes: stdMinutes }, 
                    lineId, 
                    startMinute, 
                    dayOffset
                );
                if (finalStatus === 'pending') {
                    finalStatus = 'scheduled';
                }
            } else {
                const confirmBacklog = confirm(
                    `该产线未来14天都没有可用时间。\n\n是否将工单放回待排程？\n\n[确定] = 放回待排程\n[取消] = 不保存`
                );
                
                if (confirmBacklog) {
                    finalLineId = null;
                    startMinute = null;
                    dayOffset = 0;
                    segments = null;
                    if (finalStatus === 'scheduled' || finalStatus === 'in_progress') {
                        finalStatus = 'pending';
                    }
                    Utils.showToast('工单已放回待排程', 'info');
                } else {
                    Utils.showToast('已取消保存', 'warning');
                    return;
                }
            }
        } else {
            if (finalStatus === 'scheduled' || finalStatus === 'in_progress') {
                finalStatus = 'pending';
            }
        }
        
        const updates = {
            productModel,
            quantity,
            stdMinutes,
            dueDate,
            lineId: finalLineId,
            startMinute: startMinute,
            dayOffset: dayOffset,
            segments: segments && segments.length > 1 ? segments : null,
            status: finalStatus
        };
        
        if (orderId) {
            Store.updateWorkOrder(orderId, updates);
            Utils.showToast('工单已更新', 'success');
        } else {
            Store.addWorkOrder(updates);
            Utils.showToast('工单已添加', 'success');
        }
        
        closeOrderModal();
        Gantt.render();
        updateSchemeSelect();
        updateStatusStats();
        updateExecutionStats();
    }

    function handleAutoSchedule() {
        const algorithm = document.getElementById('schedulerAlgo').value;
        
        const scheduledCount = Scheduler.autoSchedule(algorithm);
        
        if (scheduledCount > 0) {
            Gantt.render();
            updateStatusStats();
            updateExecutionStats();
            Utils.showToast(`成功排程 ${scheduledCount} 个工单`, 'success');
        } else {
            Utils.showToast('没有可排程的工单', 'info');
        }
    }

    function handleTimeScaleChange(e) {
        const scale = parseInt(e.target.value);
        Gantt.setTimeScale(scale);
        Utils.showToast(`时间刻度已切换为 ${scale === 30 ? '半小时' : '一小时'}`, 'success');
    }

    function updateSchemeSelect() {
        const select = document.getElementById('schemeSelect');
        const schemes = Store.getSchemes();
        const currentId = Store.getCurrentSchemeId();
        
        select.innerHTML = '<option value="">-- 选择方案 --</option>';
        
        schemes.forEach(scheme => {
            const option = document.createElement('option');
            option.value = scheme.id;
            option.textContent = scheme.name;
            if (scheme.id === currentId) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }

    function handleSchemeChange(e) {
        const schemeId = e.target.value;
        if (!schemeId) return;
        
        if (Store.loadScheme(schemeId)) {
            Gantt.render();
            updateStatusStats();
            updateExecutionStats();
            const scheme = Store.getCurrentScheme();
            Utils.showToast(`已加载方案: ${scheme.name}`, 'success');
        }
    }

    function openSaveSchemeModal() {
        const current = Store.getCurrentScheme();
        document.getElementById('schemeName').value = current ? current.name : '';
        document.getElementById('saveAsNew').checked = false;
        document.getElementById('saveSchemeModal').classList.add('active');
        document.getElementById('schemeName').focus();
        document.getElementById('schemeName').select();
    }

    function closeSaveSchemeModal() {
        document.getElementById('saveSchemeModal').classList.remove('active');
    }

    function handleSaveScheme() {
        const name = document.getElementById('schemeName').value.trim();
        const asNew = document.getElementById('saveAsNew').checked;
        
        if (!name) {
            Utils.showToast('请输入方案名称', 'error');
            return;
        }
        
        const existing = Store.getSchemes().find(s => s.name === name && s.id !== Store.getCurrentSchemeId());
        if (existing && !asNew) {
            Utils.showToast('方案名称已存在，请勾选"保存为新方案"', 'error');
            return;
        }
        
        const scheme = Store.saveScheme(name, asNew);
        closeSaveSchemeModal();
        updateSchemeSelect();
        Utils.showToast(`方案 "${name}" 已保存`, 'success');
    }

    function handleCopyScheme() {
        const currentId = Store.getCurrentSchemeId();
        const current = Store.getCurrentScheme();
        
        if (!currentId || !current) {
            Utils.showToast('没有可复制的方案', 'warning');
            return;
        }
        
        const newName = prompt('请输入新方案名称：', current.name + ' 副本');
        if (!newName || !newName.trim()) {
            return;
        }
        
        const trimmedName = newName.trim();
        const existing = Store.getSchemes().find(s => s.name === trimmedName);
        if (existing) {
            Utils.showToast('方案名称已存在', 'error');
            return;
        }
        
        const newScheme = Store.copyScheme(currentId, trimmedName);
        if (newScheme) {
            Store.loadScheme(newScheme.id);
            updateSchemeSelect();
            Gantt.render();
            updateStatusStats();
            updateExecutionStats();
            Utils.showToast(`已复制方案: ${trimmedName}`, 'success');
        }
    }

    function handleDeleteScheme() {
        const currentId = Store.getCurrentSchemeId();
        
        if (!currentId) {
            Utils.showToast('没有可删除的方案', 'warning');
            return;
        }
        
        const scheme = Store.getCurrentScheme();
        
        if (!confirm(`确定要删除方案 "${scheme.name}" 吗？`)) {
            return;
        }
        
        if (Store.deleteScheme(currentId)) {
            updateSchemeSelect();
            Gantt.render();
            updateStatusStats();
            updateExecutionStats();
            Utils.showToast('方案已删除', 'success');
        }
    }

    function openCompareModal() {
        const current = Store.getCurrentScheme();
        if (!current) {
            Utils.showToast('请先选择一个方案', 'warning');
            return;
        }
        
        const schemes = Store.getSchemes().filter(s => s.id !== current.id);
        const select = document.getElementById('compareSchemeSelect');
        
        select.innerHTML = '<option value="">-- 选择对比方案 --</option>';
        schemes.forEach(scheme => {
            const option = document.createElement('option');
            option.value = scheme.id;
            option.textContent = scheme.name;
            select.appendChild(option);
        });
        
        document.getElementById('currentSchemeName').textContent = current.name;
        document.getElementById('compareSchemeName').textContent = '--';
        document.getElementById('compareList').innerHTML = '<div class="empty-state"><span>请选择对比方案</span></div>';
        document.getElementById('compareLineView').innerHTML = '<div class="empty-state"><span>请选择对比方案以查看并排视图</span></div>';
        
        document.getElementById('sumCurrentTotal').textContent = '0';
        document.getElementById('sumCompareTotal').textContent = '0';
        document.getElementById('diffTotal').textContent = '+0';
        document.getElementById('sumCurrentOverdue').textContent = '0';
        document.getElementById('sumCompareOverdue').textContent = '0';
        document.getElementById('diffOverdue').textContent = '+0';
        document.getElementById('sumCurrentLoad').textContent = '0%';
        document.getElementById('sumCompareLoad').textContent = '0%';
        document.getElementById('diffLoad').textContent = '+0%';
        
        document.getElementById('movedCount').textContent = '0';
        document.getElementById('addedCount').textContent = '0';
        document.getElementById('removedCount').textContent = '0';
        document.getElementById('statusCount').textContent = '0';
        
        document.getElementById('chkShowChangedOnly').checked = false;
        compareShowChangedOnly = false;
        
        const loadTable = document.getElementById('compareLoadTable');
        loadTable.innerHTML = `
            <div class="compare-table-header">
                <span>产线</span>
                <span>当前方案</span>
                <span>对比方案</span>
                <span>差异</span>
            </div>
        `;
        
        currentCompareTab = 'moved';
        currentCompareSchemeId = null;
        
        document.querySelectorAll('.compare-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.compare-tab[data-tab="moved"]').classList.add('active');
        
        document.getElementById('compareModal').classList.add('active');
    }

    function closeCompareModal() {
        document.getElementById('compareModal').classList.remove('active');
    }

    function handleShowChangedOnly(e) {
        compareShowChangedOnly = e.target.checked;
        if (currentCompareSchemeId) {
            renderCompareLineView();
        }
    }

    function handleCompareSchemeChange(e) {
        const targetSchemeId = e.target.value;
        const currentId = Store.getCurrentSchemeId();
        
        currentCompareSchemeId = targetSchemeId;
        
        if (!targetSchemeId) {
            document.getElementById('compareList').innerHTML = '<div class="empty-state"><span>请选择对比方案</span></div>';
            document.getElementById('compareLineView').innerHTML = '<div class="empty-state"><span>请选择对比方案以查看并排视图</span></div>';
            return;
        }
        
        const comparison = Store.compareSchemes(currentId, targetSchemeId);
        if (!comparison) {
            Utils.showToast('对比失败', 'error');
            return;
        }
        
        document.getElementById('compareSchemeName').textContent = comparison.scheme2.name;
        renderComparisonSummary(comparison);
        renderCompareList();
        renderCompareLineView();
    }

    function renderComparisonSummary(comparison) {
        const totalDiff = comparison.totalOrders.scheme2 - comparison.totalOrders.scheme1;
        const overdueDiff = comparison.statsComparison.overdueDiff;
        const loadDiff = comparison.statsComparison.avgLoadDiff;
        
        document.getElementById('sumCurrentTotal').textContent = comparison.totalOrders.scheme1;
        document.getElementById('sumCompareTotal').textContent = comparison.totalOrders.scheme2;
        document.getElementById('diffTotal').textContent = (totalDiff >= 0 ? '+' : '') + totalDiff;
        document.getElementById('diffTotal').className = 'summary-diff ' + (totalDiff > 0 ? 'positive' : totalDiff < 0 ? 'negative' : 'neutral');
        
        document.getElementById('sumCurrentOverdue').textContent = comparison.statsComparison.scheme1.overdue;
        document.getElementById('sumCompareOverdue').textContent = comparison.statsComparison.scheme2.overdue;
        document.getElementById('diffOverdue').textContent = (overdueDiff >= 0 ? '+' : '') + overdueDiff;
        document.getElementById('diffOverdue').className = 'summary-diff ' + (overdueDiff < 0 ? 'positive' : overdueDiff > 0 ? 'negative' : 'neutral');
        
        document.getElementById('sumCurrentLoad').textContent = comparison.statsComparison.scheme1.avgLoad.toFixed(1) + '%';
        document.getElementById('sumCompareLoad').textContent = comparison.statsComparison.scheme2.avgLoad.toFixed(1) + '%';
        document.getElementById('diffLoad').textContent = (loadDiff >= 0 ? '+' : '') + loadDiff.toFixed(1) + '%';
        document.getElementById('diffLoad').className = 'summary-diff ' + (loadDiff > 0 ? 'positive' : loadDiff < 0 ? 'negative' : 'neutral');
        
        document.getElementById('movedCount').textContent = comparison.movedOrders.length;
        document.getElementById('addedCount').textContent = comparison.addedOrders.length;
        document.getElementById('removedCount').textContent = comparison.removedOrders.length;
        document.getElementById('statusCount').textContent = comparison.statusChanges.length;
        
        const loadTable = document.getElementById('compareLoadTable');
        let html = `
            <div class="compare-table-header">
                <span>产线</span>
                <span>当前方案</span>
                <span>对比方案</span>
                <span>差异</span>
            </div>
        `;
        
        for (const lineId in comparison.lineComparison) {
            const line = comparison.lineComparison[lineId];
            const loadDiff = line.scheme2.load - line.scheme1.load;
            html += `
                <div class="compare-table-row">
                    <span>${line.lineName}</span>
                    <span>${line.scheme1.load.toFixed(1)}% (${line.scheme1.count}单)</span>
                    <span>${line.scheme2.load.toFixed(1)}% (${line.scheme2.count}单)</span>
                    <span class="${loadDiff > 0 ? 'diff-positive' : loadDiff < 0 ? 'diff-negative' : ''}">
                        ${loadDiff >= 0 ? '+' : ''}${loadDiff.toFixed(1)}%
                    </span>
                </div>
            `;
        }
        
        loadTable.innerHTML = html;
    }

    function renderCompareLineView() {
        const container = document.getElementById('compareLineView');
        const currentId = Store.getCurrentSchemeId();
        
        if (!currentCompareSchemeId) return;
        
        const comparison = Store.compareSchemes(currentId, currentCompareSchemeId);
        if (!comparison || !comparison.lineOrders) return;
        
        const changedIds = comparison.changedOrderIds || new Set();
        const lines = Store.getLines();
        const lineIds = [...lines.map(l => l.id), 'pending'];
        const lineNames = { ...Object.fromEntries(lines.map(l => [l.id, l.name])), pending: '待排程' };
        
        let html = '';
        
        lineIds.forEach(lineId => {
            const lineOrders1 = comparison.lineOrders[lineId]?.scheme1 || [];
            const lineOrders2 = comparison.lineOrders[lineId]?.scheme2 || [];
            
            let filtered1 = lineOrders1;
            let filtered2 = lineOrders2;
            
            if (compareShowChangedOnly) {
                filtered1 = lineOrders1.filter(o => changedIds.has(o.id));
                filtered2 = lineOrders2.filter(o => changedIds.has(o.id));
                if (filtered1.length === 0 && filtered2.length === 0) return;
            }
            
            html += `
                <div class="compare-line-row">
                    <div class="compare-line-header">
                        <span class="line-dot line-${lineId.replace('line', '').toLowerCase()}"></span>
                        <span class="compare-line-name">${lineNames[lineId]}</span>
                        <span class="compare-line-count">
                            当前 ${lineOrders1.length} 单 / 对比 ${lineOrders2.length} 单
                        </span>
                    </div>
                    <div class="compare-line-body">
                        <div class="compare-line-col compare-col-left">
                            ${renderOrderColumn(filtered1, changedIds)}
                        </div>
                        <div class="compare-line-col compare-col-right">
                            ${renderOrderColumn(filtered2, changedIds)}
                        </div>
                    </div>
                </div>
            `;
        });
        
        if (html === '') {
            html = '<div class="empty-state"><span>没有变更的工单</span></div>';
        }
        
        container.innerHTML = html;
    }

    function renderOrderColumn(orders, changedIds) {
        if (orders.length === 0) {
            return '<div class="compare-col-empty">无工单</div>';
        }
        
        return orders.map(o => {
            const statusLabel = Store.STATUS_LABELS[o.status] || o.status;
            const statusClass = `status-${o.status}`;
            const isChanged = changedIds.has(o.id);
            const timeLabel = o.startMinute 
                ? `${o.dayOffset ? `Day${o.dayOffset+1} ` : ''}${Utils.formatMinutes(o.startMinute)}-${Utils.formatMinutes(o.endMinute || (o.startMinute + o.stdMinutes))}`
                : '未排程';
                
            return `
                <div class="compare-order-item ${statusClass} ${isChanged ? 'is-changed' : ''}">
                    <div class="compare-order-model">${o.productModel}</div>
                    <div class="compare-order-info">
                        <span class="compare-order-qty">${o.quantity}件</span>
                        <span class="compare-order-time">${timeLabel}</span>
                    </div>
                    <div class="compare-order-status status-${o.status}">
                        <span class="status-dot"></span>${statusLabel}
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderCompareList() {
        const list = document.getElementById('compareList');
        const currentId = Store.getCurrentSchemeId();
        
        if (!currentCompareSchemeId) {
            list.innerHTML = '<div class="empty-state"><span>请选择对比方案</span></div>';
            return;
        }
        
        const comparison = Store.compareSchemes(currentId, currentCompareSchemeId);
        if (!comparison) return;
        
        let items = [];
        
        switch (currentCompareTab) {
            case 'moved':
                items = comparison.movedOrders;
                break;
            case 'added':
                items = comparison.addedOrders;
                break;
            case 'removed':
                items = comparison.removedOrders;
                break;
            case 'status':
                items = comparison.statusChanges;
                break;
        }
        
        if (items.length === 0) {
            list.innerHTML = '<div class="empty-state"><span>没有' + getTabLabel(currentCompareTab) + '</span></div>';
            return;
        }
        
        let html = '';
        
        if (currentCompareTab === 'moved') {
            items.forEach(move => {
                const formatSlot = (slot) => {
                    if (!slot.lineId) return '待排程';
                    const lineName = Store.getLineById(slot.lineId)?.name || slot.lineId;
                    const day = slot.dayOffset ? `Day${slot.dayOffset + 1}` : '今天';
                    const time = slot.startMinute ? Utils.formatMinutes(slot.startMinute) : '';
                    return `${lineName} ${day} ${time}`;
                };
                
                html += `
                    <div class="compare-item">
                        <span class="compare-item-model">${move.model}</span>
                        <span class="compare-item-change">
                            <span class="change-from">${formatSlot(move.scheme1)}</span>
                            →
                            <span class="change-to">${formatSlot(move.scheme2)}</span>
                        </span>
                    </div>
                `;
            });
        } else if (currentCompareTab === 'added') {
            items.forEach(order => {
                html += `
                    <div class="compare-item">
                        <span class="compare-item-model">${order.productModel}</span>
                        <span class="compare-item-change">
                            <span class="change-to">新增工单 · ${order.quantity}件 · ${order.stdMinutes}分钟</span>
                        </span>
                    </div>
                `;
            });
        } else if (currentCompareTab === 'removed') {
            items.forEach(order => {
                html += `
                    <div class="compare-item">
                        <span class="compare-item-model">${order.productModel}</span>
                        <span class="compare-item-change">
                            <span class="change-from">移除工单 · ${order.quantity}件 · ${order.stdMinutes}分钟</span>
                        </span>
                    </div>
                `;
            });
        } else if (currentCompareTab === 'status') {
            items.forEach(change => {
                html += `
                    <div class="compare-item">
                        <span class="compare-item-model">${change.model}</span>
                        <span class="compare-item-change">
                            <span class="change-from">${Store.STATUS_LABELS[change.scheme1]}</span>
                            →
                            <span class="change-to">${Store.STATUS_LABELS[change.scheme2]}</span>
                        </span>
                    </div>
                `;
            });
        }
        
        list.innerHTML = html;
    }

    function getTabLabel(tab) {
        const labels = {
            moved: '挪期工单',
            added: '新增工单',
            removed: '移除工单',
            status: '状态变化'
        };
        return labels[tab] || '';
    }

    function handleSwitchToCompare() {
        if (!currentCompareSchemeId) {
            Utils.showToast('请先选择对比方案', 'warning');
            return;
        }
        
        if (Store.loadScheme(currentCompareSchemeId)) {
            closeCompareModal();
            Gantt.render();
            updateSchemeSelect();
            updateStatusStats();
            updateExecutionStats();
            const scheme = Store.getCurrentScheme();
            Utils.showToast(`已切换到方案: ${scheme.name}`, 'success');
        }
    }

    function openCalendarModal() {
        const calendar = Store.getCalendar();
        
        document.getElementById('workStartTime').value = Utils.formatMinutes(calendar.workStartTime);
        document.getElementById('workEndTime').value = Utils.formatMinutes(calendar.workEndTime);
        
        document.getElementById('shiftTypeSelect').value = calendar.shiftType || 'single';
        handleShiftTypeChange();
        
        const dayCheckboxes = document.querySelectorAll('.weekday-checkbox');
        dayCheckboxes.forEach(cb => {
            const day = parseInt(cb.value);
            cb.checked = calendar.workDays.includes(day);
        });
        
        renderDowntimeList();
        renderBreakList();
        
        document.getElementById('calendarModal').classList.add('active');
    }

    function closeCalendarModal() {
        document.getElementById('calendarModal').classList.remove('active');
    }

    function handleShiftTypeChange() {
        const shiftType = document.getElementById('shiftTypeSelect').value;
        const shifts = Store.DEFAULT_SHIFTS[shiftType] || Store.DEFAULT_SHIFTS.single;
        
        if (shiftType === 'custom') {
            document.getElementById('customShiftsGroup').style.display = 'block';
        } else {
            document.getElementById('customShiftsGroup').style.display = 'none';
            if (shifts.length > 0) {
                document.getElementById('workStartTime').value = Utils.formatMinutes(shifts[0].startMinute);
                document.getElementById('workEndTime').value = Utils.formatMinutes(shifts[shifts.length - 1].endMinute);
            }
        }
    }

    function handleSaveCalendar() {
        const workDays = [];
        document.querySelectorAll('.weekday-checkbox:checked').forEach(cb => {
            workDays.push(parseInt(cb.value));
        });
        
        if (workDays.length === 0) {
            Utils.showToast('请至少选择一个工作日', 'error');
            return;
        }
        
        const startTimeStr = document.getElementById('workStartTime').value;
        const endTimeStr = document.getElementById('workEndTime').value;
        const shiftType = document.getElementById('shiftTypeSelect').value;
        
        const workStartTime = Utils.timeToMinutes(startTimeStr);
        const workEndTime = Utils.timeToMinutes(endTimeStr);
        
        if (workStartTime >= workEndTime) {
            Utils.showToast('上班时间必须早于下班时间', 'error');
            return;
        }
        
        Store.updateCalendar({
            workDays,
            workStartTime,
            workEndTime,
            shiftType
        });
        
        Store.addAuditLog(Store.AUDIT_ACTION_TYPES.CALENDAR_UPDATE, {
            workDays,
            workStartTime,
            workEndTime,
            shiftType
        });
        
        Scheduler.updateCalendarSettings();
        Gantt.updateCalendarSettings();
        
        closeCalendarModal();
        Gantt.render();
        updateStatusStats();
        updateExecutionStats();
        Utils.showToast('生产日历已更新', 'success');
    }

    function renderBreakList() {
        const calendar = Store.getCalendar();
        const list = document.getElementById('breakList');
        
        if (!calendar.breakPeriods || calendar.breakPeriods.length === 0) {
            list.innerHTML = '<div class="empty-state small"><span>暂无休息时段</span></div>';
            return;
        }
        
        let html = '';
        calendar.breakPeriods.forEach(period => {
            html += `
                <div class="downtime-item">
                    <div class="downtime-info">
                        <div class="downtime-date">${period.name || '休息'}</div>
                        <div class="downtime-time">${Utils.formatMinutes(period.startMinute)} - ${Utils.formatMinutes(period.endMinute)}</div>
                        ${period.recurring ? `<div class="downtime-reason">每日循环</div>` : ''}
                    </div>
                    <button class="downtime-delete" onclick="App.removeBreak('${period.id}')" title="删除">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            `;
        });
        
        list.innerHTML = html;
    }

    function openBreakModal() {
        document.getElementById('breakName').value = '';
        document.getElementById('breakStart').value = '12:00';
        document.getElementById('breakEnd').value = '13:00';
        document.getElementById('breakRecurring').checked = true;
        document.getElementById('breakModal').classList.add('active');
    }

    function closeBreakModal() {
        document.getElementById('breakModal').classList.remove('active');
    }

    function handleConfirmBreak() {
        const name = document.getElementById('breakName').value.trim() || '休息';
        const startStr = document.getElementById('breakStart').value;
        const endStr = document.getElementById('breakEnd').value;
        const recurring = document.getElementById('breakRecurring').checked;
        
        if (!startStr || !endStr) {
            Utils.showToast('请填写完整的休息时间', 'error');
            return;
        }
        
        const startMinute = Utils.timeToMinutes(startStr);
        const endMinute = Utils.timeToMinutes(endStr);
        
        if (startMinute >= endMinute) {
            Utils.showToast('开始时间必须早于结束时间', 'error');
            return;
        }
        
        Store.addBreakPeriod({
            name,
            startMinute,
            endMinute,
            recurring
        });
        
        closeBreakModal();
        renderBreakList();
        Gantt.render();
        Utils.showToast('休息时段已添加', 'success');
    }

    function removeBreak(id) {
        if (confirm('确定删除这个休息时段吗？')) {
            Store.removeBreakPeriod(id);
            renderBreakList();
            Gantt.render();
            Utils.showToast('休息时段已删除', 'success');
        }
    }

    function renderDowntimeList() {
        const calendar = Store.getCalendar();
        const list = document.getElementById('downtimeList');
        
        if (calendar.downtimePeriods.length === 0) {
            list.innerHTML = '<div class="empty-state small"><span>暂无停机时段</span></div>';
            return;
        }
        
        let html = '';
        calendar.downtimePeriods.forEach(period => {
            html += `
                <div class="downtime-item">
                    <div class="downtime-info">
                        <div class="downtime-date">${period.date}</div>
                        <div class="downtime-time">${Utils.formatMinutes(period.startMinute)} - ${Utils.formatMinutes(period.endMinute)}</div>
                        ${period.reason ? `<div class="downtime-reason">${period.reason}</div>` : ''}
                    </div>
                    <button class="downtime-delete" onclick="App.removeDowntime('${period.id}')" title="删除">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            `;
        });
        
        list.innerHTML = html;
    }

    function openDowntimeModal() {
        document.getElementById('downtimeDate').value = Utils.getTodayDateStr();
        document.getElementById('downtimeStart').value = '12:00';
        document.getElementById('downtimeEnd').value = '13:00';
        document.getElementById('downtimeReason').value = '';
        document.getElementById('downtimeModal').classList.add('active');
    }

    function closeDowntimeModal() {
        document.getElementById('downtimeModal').classList.remove('active');
    }

    function handleConfirmDowntime() {
        const date = document.getElementById('downtimeDate').value;
        const startStr = document.getElementById('downtimeStart').value;
        const endStr = document.getElementById('downtimeEnd').value;
        const reason = document.getElementById('downtimeReason').value.trim();
        
        if (!date || !startStr || !endStr) {
            Utils.showToast('请填写完整的停机信息', 'error');
            return;
        }
        
        const startMinute = Utils.timeToMinutes(startStr);
        const endMinute = Utils.timeToMinutes(endStr);
        
        if (startMinute >= endMinute) {
            Utils.showToast('开始时间必须早于结束时间', 'error');
            return;
        }
        
        Store.addDowntimePeriod({
            date,
            startMinute,
            endMinute,
            reason
        });
        
        closeDowntimeModal();
        renderDowntimeList();
        Gantt.render();
        Utils.showToast('停机时段已添加', 'success');
    }

    function removeDowntime(id) {
        if (confirm('确定删除这个停机时段吗？')) {
            Store.removeDowntimePeriod(id);
            renderDowntimeList();
            Gantt.render();
            Utils.showToast('停机时段已删除', 'success');
        }
    }

    function openExecutionModal(orderId) {
        const order = Store.getWorkOrderById(orderId);
        if (!order) return;
        
        editingOrderId = orderId;
        const execution = Store.getExecutionData(orderId);
        
        document.getElementById('executionOrderModel').textContent = order.productModel;
        document.getElementById('executionOrderQty').textContent = order.quantity + ' 件';
        document.getElementById('executionOrderStd').textContent = order.stdMinutes + ' 分钟';
        document.getElementById('executionStatus').textContent = Store.STATUS_LABELS[order.status] || order.status;
        document.getElementById('executionStatus').className = 'status-badge status-' + order.status;
        
        document.getElementById('executionStartTime').value = execution?.actualStartTime || '';
        document.getElementById('executionEndTime').value = execution?.actualEndTime || '';
        document.getElementById('executionProgress').value = execution?.progress || 0;
        document.getElementById('executionProgressValue').textContent = (execution?.progress || 0) + '%';
        document.getElementById('executionActualQty').value = execution?.actualQuantity || 0;
        document.getElementById('executionNotes').value = execution?.notes || '';
        document.getElementById('executionCancelReason').value = execution?.cancelReason || '';
        
        document.getElementById('btnStartWork').style.display = (order.status === 'scheduled') ? 'inline-flex' : 'none';
        document.getElementById('btnCompleteWork').style.display = (order.status === 'in_progress') ? 'inline-flex' : 'none';
        document.getElementById('btnCancelWork').style.display = (order.status !== 'completed' && order.status !== 'cancelled') ? 'inline-flex' : 'none';
        document.getElementById('cancelReasonGroup').style.display = (order.status === 'cancelled') ? 'block' : 'none';
        
        document.getElementById('executionModal').classList.add('active');
    }

    function closeExecutionModal() {
        document.getElementById('executionModal').classList.remove('active');
        editingOrderId = null;
    }

    function handleStartWork() {
        if (!editingOrderId) return;
        if (Store.startWork(editingOrderId)) {
            const order = Store.getWorkOrderById(editingOrderId);
            document.getElementById('executionStatus').textContent = Store.STATUS_LABELS[order.status];
            document.getElementById('executionStatus').className = 'status-badge status-' + order.status;
            
            const execution = Store.getExecutionData(editingOrderId);
            document.getElementById('executionStartTime').value = execution?.actualStartTime || '';
            document.getElementById('executionProgress').value = execution?.progress || 5;
            document.getElementById('executionProgressValue').textContent = (execution?.progress || 5) + '%';
            
            document.getElementById('btnStartWork').style.display = 'none';
            document.getElementById('btnCompleteWork').style.display = 'inline-flex';
            
            Gantt.render();
            updateStatusStats();
            updateExecutionStats();
            Utils.showToast('工单已开始生产', 'success');
        }
    }

    function handleCompleteWork() {
        if (!editingOrderId) return;
        
        const order = Store.getWorkOrderById(editingOrderId);
        const actualQty = parseInt(document.getElementById('executionActualQty').value) || order.quantity;
        
        if (Store.completeWork(editingOrderId, actualQty)) {
            const updatedOrder = Store.getWorkOrderById(editingOrderId);
            document.getElementById('executionStatus').textContent = Store.STATUS_LABELS[updatedOrder.status];
            document.getElementById('executionStatus').className = 'status-badge status-' + updatedOrder.status;
            
            const execution = Store.getExecutionData(editingOrderId);
            document.getElementById('executionEndTime').value = execution?.actualEndTime || '';
            document.getElementById('executionProgress').value = 100;
            document.getElementById('executionProgressValue').textContent = '100%';
            document.getElementById('executionActualQty').value = execution?.actualQuantity || actualQty;
            
            document.getElementById('btnCompleteWork').style.display = 'none';
            document.getElementById('btnCancelWork').style.display = 'none';
            
            Gantt.render();
            updateStatusStats();
            updateExecutionStats();
            Utils.showToast('工单已完成', 'success');
        }
    }

    function handleCancelWork() {
        if (!editingOrderId) return;
        
        const reason = prompt('请输入取消原因：', '计划调整');
        if (reason === null) return;
        
        if (Store.cancelWork(editingOrderId, reason)) {
            const order = Store.getWorkOrderById(editingOrderId);
            document.getElementById('executionStatus').textContent = Store.STATUS_LABELS[order.status];
            document.getElementById('executionStatus').className = 'status-badge status-' + order.status;
            
            const execution = Store.getExecutionData(editingOrderId);
            document.getElementById('executionCancelReason').value = execution?.cancelReason || reason;
            document.getElementById('cancelReasonGroup').style.display = 'block';
            
            document.getElementById('btnStartWork').style.display = 'none';
            document.getElementById('btnCompleteWork').style.display = 'none';
            document.getElementById('btnCancelWork').style.display = 'none';
            
            Gantt.render();
            updateStatusStats();
            updateExecutionStats();
            Utils.showToast('工单已取消', 'success');
        }
    }

    function handleSaveExecution() {
        if (!editingOrderId) return;
        
        const updates = {};
        
        const startStr = document.getElementById('executionStartTime').value;
        if (startStr) updates.actualStartTime = startStr;
        
        const endStr = document.getElementById('executionEndTime').value;
        if (endStr) updates.actualEndTime = endStr;
        
        const progress = parseInt(document.getElementById('executionProgress').value);
        if (!isNaN(progress)) updates.progress = progress;
        
        const actualQty = parseInt(document.getElementById('executionActualQty').value);
        if (!isNaN(actualQty)) updates.actualQuantity = actualQty;
        
        const notes = document.getElementById('executionNotes').value.trim();
        if (notes) updates.notes = notes;
        
        Store.updateExecutionData(editingOrderId, updates);
        Gantt.render();
        updateExecutionStats();
        Utils.showToast('执行数据已保存', 'success');
    }

    function openAuditLogModal() {
        renderAuditLogList();
        document.getElementById('auditLogModal').classList.add('active');
    }

    function closeAuditLogModal() {
        document.getElementById('auditLogModal').classList.remove('active');
    }

    function renderAuditLogList() {
        const actionFilter = document.getElementById('auditActionFilter').value;
        const logs = Store.getAuditLogs(actionFilter ? { actionType: actionFilter } : null);
        const list = document.getElementById('auditLogList');
        
        if (logs.length === 0) {
            list.innerHTML = '<div class="empty-state"><span>暂无变更记录</span></div>';
            return;
        }
        
        const actionLabels = {
            order_add: '添加工单',
            order_edit: '编辑工单',
            order_delete: '删除工单',
            order_move: '移动工单',
            order_status_change: '状态变更',
            scheme_save: '保存方案',
            scheme_switch: '切换方案',
            scheme_copy: '复制方案',
            scheme_delete: '删除方案',
            auto_schedule: '自动排程',
            calendar_update: '日历更新'
        };
        
        let html = '';
        logs.slice(0, 100).forEach(log => {
            const timeStr = new Date(log.timestamp).toLocaleString('zh-CN');
            const actionLabel = actionLabels[log.actionType] || log.actionType;
            const details = formatAuditDetails(log);
            
            html += `
                <div class="audit-item audit-${log.actionType}">
                    <div class="audit-header">
                        <span class="audit-action">${actionLabel}</span>
                        <span class="audit-time">${timeStr}</span>
                    </div>
                    <div class="audit-details">${details}</div>
                    ${log.schemeId ? `<div class="audit-scheme">方案: ${log.schemeName || log.schemeId}</div>` : ''}
                </div>
            `;
        });
        
        list.innerHTML = html;
    }

    function formatAuditDetails(log) {
        const d = log.details || {};
        
        switch (log.actionType) {
            case 'order_add':
                return `新增工单: ${d.productModel || '未知'} (${d.quantity || 0}件, ${d.stdMinutes || 0}分钟)`;
            case 'order_edit':
                return `编辑工单: ${d.productModel || d.orderId || '未知'}${d.changes ? ` (${d.changes.join(', ')})` : ''}`;
            case 'order_delete':
                return `删除工单: ${d.productModel || d.orderId || '未知'}`;
            case 'order_move':
                return `移动工单: ${d.model || d.orderId || '未知'} 从 ${formatSlot(d.from)} → ${formatSlot(d.to)}`;
            case 'order_status_change':
                return `状态变更: ${d.model || d.orderId || '未知'} ${Store.STATUS_LABELS[d.from] || d.from} → ${Store.STATUS_LABELS[d.to] || d.to}`;
            case 'scheme_save':
                return `保存方案: ${d.name || '未知'}${d.asNew ? ' (新建)' : ''}`;
            case 'scheme_switch':
                return `切换方案: ${d.fromName || d.from} → ${d.toName || d.to}`;
            case 'scheme_copy':
                return `复制方案: ${d.fromName || d.from} → ${d.toName || d.to}`;
            case 'scheme_delete':
                return `删除方案: ${d.name || '未知'}`;
            case 'auto_schedule':
                return `自动排程: 算法=${d.algorithm === 'edd' ? '最早交货优先' : '最短工时优先'}, 成功${d.scheduledCount || 0}/${d.totalOrders || 0}单`;
            case 'calendar_update':
                return `日历更新: ${d.workDays?.length || 0}个工作日, 班次=${d.shiftType || '默认'}`;
            default:
                return JSON.stringify(d).substring(0, 100);
        }
    }

    function formatSlot(slot) {
        if (!slot || !slot.lineId) return '待排程';
        const lineName = Store.getLineById(slot.lineId)?.name || slot.lineId;
        const day = slot.dayOffset ? `Day${slot.dayOffset + 1}` : '今天';
        const time = slot.startMinute ? Utils.formatMinutes(slot.startMinute) : '';
        return `${lineName} ${day} ${time}`;
    }

    function updateStatusStats() {
        const stats = Store.getStatusStats();
        
        document.getElementById('countPending').textContent = stats.pending || 0;
        document.getElementById('countScheduled').textContent = stats.scheduled || 0;
        document.getElementById('countInProgress').textContent = stats.in_progress || 0;
        document.getElementById('countCompleted').textContent = stats.completed || 0;
        document.getElementById('countCancelled').textContent = stats.cancelled || 0;
    }

    function updateExecutionStats() {
        const stats = Store.getExecutionStats();
        
        const inProgressEl = document.getElementById('countExecInProgress');
        const completedTodayEl = document.getElementById('countCompletedToday');
        const avgProgressEl = document.getElementById('avgProgress');
        
        if (inProgressEl) inProgressEl.textContent = stats.inProgressCount || 0;
        if (completedTodayEl) completedTodayEl.textContent = stats.completedTodayCount || 0;
        if (avgProgressEl) avgProgressEl.textContent = (stats.avgProgress || 0).toFixed(0) + '%';
    }

    document.addEventListener('DOMContentLoaded', init);

    const App = {
        init,
        openEditModal,
        removeDowntime,
        removeBreak,
        updateStatusStats,
        updateExecutionStats,
        openExecutionModal
    };
    if (typeof window !== 'undefined') {
        window.App = App;
    }
    return App;
})();
