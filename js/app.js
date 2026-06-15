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
        
        document.getElementById('btnCancelSave').addEventListener('click', closeSaveSchemeModal);
        document.getElementById('btnConfirmSave').addEventListener('click', handleSaveScheme);
        document.getElementById('saveSchemeModal').addEventListener('click', (e) => {
            if (e.target.id === 'saveSchemeModal') closeSaveSchemeModal();
        });
        
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
        if (lineId) {
            const line = Store.getLineById(lineId);
            startMinute = line.workStartTime;
            
            if (Store.hasConflict(orderId || 'new', lineId, startMinute, stdMinutes)) {
                startMinute = findNextAvailableSlot(lineId, stdMinutes);
                if (startMinute === null) {
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
                startMinute
            });
            Utils.showToast('工单已更新', 'success');
        } else {
            Store.addWorkOrder({
                productModel,
                quantity,
                stdMinutes,
                dueDate,
                lineId,
                startMinute
            });
            Utils.showToast('工单已添加', 'success');
        }
        
        closeOrderModal();
        Gantt.render();
        updateSchemeSelect();
    }

    function findNextAvailableSlot(lineId, duration) {
        const lineOrders = Store.getOrdersByLine(lineId);
        
        if (lineOrders.length === 0) {
            const line = Store.getLineById(lineId);
            return line.workStartTime;
        }
        
        let lastEnd = Store.getLineById(lineId).workStartTime;
        lineOrders.forEach(order => {
            lastEnd = Math.max(lastEnd, order.startMinute + order.stdMinutes);
        });
        
        const line = Store.getLineById(lineId);
        if (lastEnd + duration <= line.workEndTime) {
            return lastEnd;
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
        document.getElementById('saveSchemeModal').classList.add('active');
        document.getElementById('schemeName').focus();
        document.getElementById('schemeName').select();
    }

    function closeSaveSchemeModal() {
        document.getElementById('saveSchemeModal').classList.remove('active');
    }

    function handleSaveScheme() {
        const name = document.getElementById('schemeName').value.trim();
        
        if (!name) {
            Utils.showToast('请输入方案名称', 'error');
            return;
        }
        
        const scheme = Store.saveScheme(name);
        closeSaveSchemeModal();
        updateSchemeSelect();
        Utils.showToast(`方案 "${name}" 已保存`, 'success');
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
        init
    };
})();
