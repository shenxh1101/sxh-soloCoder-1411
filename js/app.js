const App = (function() {
    let currentCompareTab = 'moved';
    let currentCompareSchemeId = null;
    let editingOrderId = null;

    function init() {
        Store.init();
        Gantt.init();
        
        setupEventListeners();
        updateSchemeSelect();
        updateStatusStats();
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
        
        document.querySelectorAll('.compare-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.compare-tab').forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                currentCompareTab = e.currentTarget.dataset.tab;
                renderCompareList();
            });
        });
        
        document.getElementById('timeScaleSelect').addEventListener('change', handleTimeScaleChange);
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeOrderModal();
                closeSaveSchemeModal();
                closeCalendarModal();
                closeCompareModal();
                closeDowntimeModal();
                editingOrderId = null;
            }
        });
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
    }

    function handleAutoSchedule() {
        const algorithm = document.getElementById('schedulerAlgo').value;
        
        const scheduledCount = Scheduler.autoSchedule(algorithm);
        
        if (scheduledCount > 0) {
            Gantt.render();
            updateStatusStats();
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

    function handleCompareSchemeChange(e) {
        const targetSchemeId = e.target.value;
        const currentId = Store.getCurrentSchemeId();
        
        currentCompareSchemeId = targetSchemeId;
        
        if (!targetSchemeId) {
            document.getElementById('compareList').innerHTML = '<div class="empty-state"><span>请选择对比方案</span></div>';
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
            const scheme = Store.getCurrentScheme();
            Utils.showToast(`已切换到方案: ${scheme.name}`, 'success');
        }
    }

    function openCalendarModal() {
        const calendar = Store.getCalendar();
        
        document.getElementById('workStartTime').value = Utils.formatMinutes(calendar.workStartTime);
        document.getElementById('workEndTime').value = Utils.formatMinutes(calendar.workEndTime);
        
        const dayCheckboxes = document.querySelectorAll('.weekday-checkbox');
        dayCheckboxes.forEach(cb => {
            const day = parseInt(cb.value);
            cb.checked = calendar.workDays.includes(day);
        });
        
        renderDowntimeList();
        
        document.getElementById('calendarModal').classList.add('active');
    }

    function closeCalendarModal() {
        document.getElementById('calendarModal').classList.remove('active');
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
        
        const workStartTime = Utils.timeToMinutes(startTimeStr);
        const workEndTime = Utils.timeToMinutes(endTimeStr);
        
        if (workStartTime >= workEndTime) {
            Utils.showToast('上班时间必须早于下班时间', 'error');
            return;
        }
        
        Store.updateCalendar({
            workDays,
            workStartTime,
            workEndTime
        });
        
        Scheduler.updateCalendarSettings();
        Gantt.updateCalendarSettings();
        
        closeCalendarModal();
        Gantt.render();
        updateStatusStats();
        Utils.showToast('生产日历已更新', 'success');
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

    function updateStatusStats() {
        const stats = Store.getStatusStats();
        
        document.getElementById('countPending').textContent = stats.pending || 0;
        document.getElementById('countScheduled').textContent = stats.scheduled || 0;
        document.getElementById('countInProgress').textContent = stats.in_progress || 0;
        document.getElementById('countCompleted').textContent = stats.completed || 0;
        document.getElementById('countCancelled').textContent = stats.cancelled || 0;
    }

    document.addEventListener('DOMContentLoaded', init);

    return {
        init,
        openEditModal,
        removeDowntime,
        updateStatusStats
    };
})();
