const App = (function() {
    function init() {
        Store.init();
        Gantt.init();
        
        setupEventListeners();
        updateSchemeSelect();
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
        
        document.getElementById('btnCancelSave').addEventListener('click', closeSaveSchemeModal);
        document.getElementById('btnConfirmSave').addEventListener('click', handleSaveScheme);
        document.getElementById('saveSchemeModal').addEventListener('click', (e) => {
            if (e.target.id === 'saveSchemeModal') closeSaveSchemeModal();
        });
        
        document.getElementById('timeScaleSelect').addEventListener('change', handleTimeScaleChange);
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeOrderModal();
                closeSaveSchemeModal();
            }
        });
    }

    function openAddModal() {
        document.getElementById('modalTitle').textContent = '添加新工单';
        document.getElementById('orderForm').reset();
        document.getElementById('orderId').value = '';
        document.getElementById('dueDate').value = Utils.getTodayDateStr();
        document.getElementById('lineSelect').value = '';
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
        
        if (!productModel || !quantity || !stdMinutes || !dueDate) {
            Utils.showToast('请填写所有必填项', 'error');
            return;
        }
        
        let startMinute = null;
        let dayOffset = 0;
        if (lineId) {
            const line = Store.getLineById(lineId);
            startMinute = line.workStartTime;
            dayOffset = 0;
            
            if (Store.hasConflict(orderId || 'new', lineId, startMinute, stdMinutes, dayOffset)) {
                const slot = findNextAvailableSlot(lineId, stdMinutes);
                if (slot) {
                    startMinute = slot.startMinute;
                    dayOffset = slot.dayOffset;
                } else {
                    Utils.showToast('该产线已满，无法直接分配', 'warning');
                }
            }
        }
        
        if (orderId) {
            Store.updateWorkOrder(orderId, {
                productModel,
                quantity,
                stdMinutes,
                dueDate,
                lineId,
                startMinute,
                dayOffset
            });
            Utils.showToast('工单已更新', 'success');
        } else {
            Store.addWorkOrder({
                productModel,
                quantity,
                stdMinutes,
                dueDate,
                lineId,
                startMinute,
                dayOffset
            });
            Utils.showToast('工单已添加', 'success');
        }
        
        closeOrderModal();
        Gantt.render();
        updateSchemeSelect();
    }

    function findNextAvailableSlot(lineId, duration) {
        const WORK_START = 480;
        const WORK_END = 1080;
        const WORK_PER_DAY = WORK_END - WORK_START;
        const MAX_DAYS = 3;
        
        const lineOrders = Store.getOrdersByLine(lineId);
        
        const occupiedSlots = [];
        lineOrders.forEach(existing => {
            const day = existing.dayOffset || 0;
            const startAbsolute = day * WORK_PER_DAY + (existing.startMinute - WORK_START);
            const endAbsolute = startAbsolute + existing.stdMinutes;
            occupiedSlots.push({ start: startAbsolute, end: endAbsolute });
        });
        
        occupiedSlots.sort((a, b) => a.start - b.start);
        
        for (let day = 0; day < MAX_DAYS; day++) {
            const dayStart = day * WORK_PER_DAY;
            const dayEnd = dayStart + WORK_PER_DAY;
            
            let candidateStart = dayStart;
            
            const daySlots = occupiedSlots.filter(s => s.end > dayStart && s.start < dayEnd);
            
            for (const slot of daySlots) {
                if (candidateStart + duration <= slot.start) {
                    const minute = WORK_START + (candidateStart % WORK_PER_DAY);
                    return { startMinute: minute, dayOffset: day };
                }
                candidateStart = Math.max(candidateStart, slot.end);
            }
            
            if (candidateStart + duration <= dayEnd) {
                const minute = WORK_START + (candidateStart % WORK_PER_DAY);
                return { startMinute: minute, dayOffset: day };
            }
        }
        
        return null;
    }

    function handleAutoSchedule() {
        const algorithm = document.getElementById('schedulerAlgo').value;
        
        const scheduledCount = Scheduler.autoSchedule(algorithm);
        
        if (scheduledCount > 0) {
            Gantt.render();
            Utils.showToast(`成功排程 ${scheduledCount} 个工单`, 'success');
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
            Utils.showToast('方案已删除', 'success');
        }
    }

    document.addEventListener('DOMContentLoaded', init);

    return {
        init,
        openEditModal
    };
})();
