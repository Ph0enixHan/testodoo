/** @odoo-module **/

import { patchUiSize, SIZES } from '@mail/../tests/helpers/patch_ui_size';
import {
    start,
    startServer,
} from '@mail/../tests/helpers/test_utils';

import {
    click,
    triggerEvent,
} from "@web/../tests/helpers/utils";

import invoiceExtractTestUtils from '@account_invoice_extract/tests/helpers/invoice_extract_test_utils';
import { registry } from "@web/core/registry";
import { accountMove } from '@account/components/account_move_service/account_move_service';

QUnit.module('account_invoice_extract', {}, function () {
QUnit.module('invoice_extract_form_view_tests.js', {
    beforeEach() {
        patchUiSize({ size: SIZES.XXL });
        registry.category("services").add("account_move", accountMove);
    },
}, function () {

    QUnit.test('basic', async function (assert) {
        assert.expect(37);

        const pyEnv = await startServer();

        const resCurrencyId1 = pyEnv['res.currency'].create({ name: 'USD' });
        const resCurrencyId2 = pyEnv['res.currency'].create({ name: 'EUR' });

        const resPartnerId1 = pyEnv['res.partner'].create({ name: "Odoo", vat: "BE0477472701" });

        const accountMoveId1 = pyEnv['account.move'].create({
            amount_total: 100,
            currency_id: resCurrencyId1,
            date: '1984-12-15',
            invoice_date_due: '1984-12-20',
            display_name: 'MyInvoice',
            invoice_date: '1984-12-15',
            state: 'draft',
            move_type: 'in_invoice',
            extract_state: 'waiting_validation',
        });

        const irAttachmentId1 = pyEnv['ir.attachment'].create({
            mimetype: 'image/jpeg',
            res_model: 'account.move',
            res_id: accountMoveId1,
        });

        pyEnv['account.move'].write([accountMoveId1], { extract_attachment_id: irAttachmentId1 });

        pyEnv['mail.message'].create({
            attachment_ids: [irAttachmentId1],
            model: 'account.move',
            res_id: accountMoveId1,
        });

        const views = {
            'account.move,false,form':
                `<form string="Account Invoice" js_class="account_move_form">
                    <group>
                        <field name="extract_state" invisible="1"/>
                        <field name="state" invisible="1"/>
                        <field name="move_type" invisible="1"/>
                        <field name="extract_attachment_id" invisible="1"/>
                        <field name="partner_id" readonly="0" widget="res_partner_many2one"/>
                        <field name="ref" readonly="0"/>
                        <field name="invoice_date" readonly="0"/>
                        <field name="invoice_date_due" readonly="0"/>
                        <field name="currency_id" readonly="0"/>
                        <field name="quick_edit_total_amount" readonly="0"/>
                    </group>
                    <div class="o_attachment_preview"/>
                    <div class="oe_chatter">
                        <field name="message_ids"/>
                    </div>
                </form>`,
            'res.partner,false,form':
                `<form>
                    <group>
                        <field name="name" readonly="0"/>
                        <field name="vat" readonly="0"/>
                    </group>
                </form>`,
        };
        const { afterEvent, openView } = await start({
            serverData: { views },
            mockRPC(route, args) {
                if (args.method === 'get_boxes') {
                    return Promise.resolve(invoiceExtractTestUtils.createBoxesData());
                }
                else if (args.method === 'set_user_selected_box') {
                    const boxId = args.args[1];
                    switch (boxId) {
                        case 1: return Promise.resolve(resPartnerId1);
                        case 2: return Promise.resolve(false);
                        case 4: return Promise.resolve("some invoice_id");
                        case 7: return Promise.resolve(false);
                        case 8: return Promise.resolve(resPartnerId1);
                        case 10: return Promise.resolve(123);
                        case 12: return Promise.resolve("2022-01-01 00:00:00");
                        case 14: return Promise.resolve("2022-01-15 00:00:00");
                        case 16: return Promise.resolve(resCurrencyId2);
                    }
                }
            },
        });
        await afterEvent({
            eventName: 'o-thread-view-hint-processed',
            async func() {
                await openView({
                    res_id: accountMoveId1,
                    res_model: 'account.move',
                    views: [[false, 'form']],
                });
            },
            message: "should wait until account.move thread displayed its messages",
            predicate: ({ hint, threadViewer }) => {
                return (
                    hint.type === 'new-messages-loaded' &&
                    threadViewer.thread.model === 'account.move' &&
                    threadViewer.thread.id === accountMoveId1
                );
            },
        });

        const attachmentPreview = document.querySelector('.o_attachment_preview_img');

        assert.ok(attachmentPreview, "should display attachment preview");

        // ---------- Supplier & VAT Number ----------

        // Focus the field
        await triggerEvent(document, '.o_field_widget[name=partner_id] input', 'focusin');

        // Check boxes presence for supplier & VAT number
        assert.strictEqual(attachmentPreview.querySelectorAll('.o_invoice_extract_box').length, 6,
            "there should be 6 boxes when the partner_id field is focused");
        assert.strictEqual(attachmentPreview.querySelectorAll('.o_invoice_extract_box[data-field-name=supplier]').length, 3,
            "there should be 3 boxes with field name supplier");
        assert.strictEqual(attachmentPreview.querySelectorAll('.o_invoice_extract_box[data-field-name=VAT_Number]').length, 3,
            "there should be 3 boxes with field name VAT_Number");

        // Check selection of VAT number boxes
        assert.doesNotHaveClass(attachmentPreview.querySelector('.o_invoice_extract_box[data-id="1"]'), 'ocr_chosen',
            "box with ID 1 should not be OCR chosen");
        assert.doesNotHaveClass(attachmentPreview.querySelector('.o_invoice_extract_box[data-id="1"]'), 'selected',
            "box with ID 1 should not be selected");
        assert.hasClass(attachmentPreview.querySelector('.o_invoice_extract_box[data-id="2"]'), 'ocr_chosen',
            "box with ID 2 should be OCR chosen");
        assert.doesNotHaveClass(attachmentPreview.querySelector('.o_invoice_extract_box[data-id="2"]'), 'selected',
            "box with ID 2 should not be selected");
        assert.doesNotHaveClass(attachmentPreview.querySelector('.o_invoice_extract_box[data-id="3"]'), 'ocr_chosen',
            "box with ID 3 should not be OCR chosen");
        assert.hasClass(attachmentPreview.querySelector('.o_invoice_extract_box[data-id="3"]'), 'selected',
            "box with ID 3 should be selected");

        // Check selection of supplier boxes
        assert.doesNotHaveClass(attachmentPreview.querySelector('.o_invoice_extract_box[data-id="6"]'), 'ocr_chosen',
            "box with ID 1 should not be OCR chosen");
        assert.hasClass(attachmentPreview.querySelector('.o_invoice_extract_box[data-id="6"]'), 'selected',
            "box with ID 1 should not be selected");
        assert.hasClass(attachmentPreview.querySelector('.o_invoice_extract_box[data-id="7"]'), 'ocr_chosen',
            "box with ID 2 should be OCR chosen");
        assert.doesNotHaveClass(attachmentPreview.querySelector('.o_invoice_extract_box[data-id="7"]'), 'selected',
            "box with ID 2 should not be selected");
        assert.doesNotHaveClass(attachmentPreview.querySelector('.o_invoice_extract_box[data-id="8"]'), 'ocr_chosen',
            "box with ID 3 should not be OCR chosen");
        assert.doesNotHaveClass(attachmentPreview.querySelector('.o_invoice_extract_box[data-id="8"]'), 'selected',
            "box with ID 3 should be selected");

        // Click on the VAT number box with ID 1
        await click(attachmentPreview, '.o_invoice_extract_box[data-id="1"]', { skipVisibilityCheck: true });
        assert.strictEqual(document.querySelector('.o_field_widget[name=partner_id] input').value, "Odoo",
            "partner_id field should be set to Odoo");
        assert.hasClass(attachmentPreview.querySelector('.o_invoice_extract_box[data-id="1"]'), 'selected',
            "box with ID 1 should be selected");
        assert.doesNotHaveClass(attachmentPreview.querySelector('.o_invoice_extract_box[data-id="2"]'), 'selected',
            "box with ID 2 should not be selected");

        // Click on the VAT number box with ID 2
        await click(attachmentPreview, '.o_invoice_extract_box[data-id="2"]', { skipVisibilityCheck: true });
        // Check that a modal opened to create a res.partner with the VAT number pre-filled
        assert.strictEqual(document.querySelector('.o_dialog_container input#vat').value, "BE0477472701",
            "a modal to create a new partner should be opened with the content of the box clicked as the partner VAT number");
        await click(document, '.o_dialog_container .o_form_button_cancel');

        // Re-focus the field
        await triggerEvent(document, '.o_field_widget[name=partner_id] input', 'focusin');

        // Click on the supplier box with ID 7
        await click(attachmentPreview, '.o_invoice_extract_box[data-id="7"]', { skipVisibilityCheck: true });
        // Check that a modal opened to create a res.partner with the name pre-filled
        assert.strictEqual(document.querySelector('.o_dialog_container input#name').value, "Some partner",
            "a modal to create a new partner should be opened with the content of the box clicked as the partner name");
        await click(document, '.o_dialog_container .o_form_button_cancel');

        // Re-focus the field
        await triggerEvent(document, '.o_field_widget[name=partner_id] input', 'focusin');

        // Click on the VAT number box with ID 8
        await click(attachmentPreview, '.o_invoice_extract_box[data-id="8"]', { skipVisibilityCheck: true });
        assert.strictEqual(document.querySelector('.o_field_widget[name=partner_id] input').value, "Odoo",
            "partner_id field should be set to Odoo");

        // ---------- Invoice ID ----------

        // Focus the field
        await triggerEvent(document, '.o_field_widget[name=ref] input', 'focusin');

        // Check boxes presence for invoice ID
        assert.strictEqual(attachmentPreview.querySelectorAll('.o_invoice_extract_box').length, 2,
            "there should be 2 boxes when the invoice ID field is focused");
        assert.strictEqual(attachmentPreview.querySelectorAll('.o_invoice_extract_box[data-field-name=invoice_id]').length, 2,
            "there should be 2 boxes with field name invoice_id");

        // Click on the invoice ID box with ID 4
        await click(attachmentPreview, '.o_invoice_extract_box[data-id="4"]', { skipVisibilityCheck: true });
        assert.strictEqual(document.querySelector('.o_field_widget[name=ref] input').value, "some invoice_id",
            "the invoice ID field should be filled according to the content of the box clicked");

        // ---------- Total ----------

        // Focus the field
        await triggerEvent(document, '.o_field_widget[name=quick_edit_total_amount] input', 'focusin');

        // Check boxes presence for total
        assert.strictEqual(attachmentPreview.querySelectorAll('.o_invoice_extract_box').length, 2,
            "there should be 2 boxes when the total field is focused");
        assert.strictEqual(attachmentPreview.querySelectorAll('.o_invoice_extract_box[data-field-name=total]').length, 2,
            "there should be 2 boxes with field name total");

        // Click on the total box with ID 10
        await click(attachmentPreview, '.o_invoice_extract_box[data-id="10"]', { skipVisibilityCheck: true });
        assert.strictEqual(document.querySelector('.o_field_widget[name=quick_edit_total_amount] input').value, "123.00",
            "the total field should be filled according to the content of the box clicked");

        // ---------- Date ----------

        // Focus the field
        await triggerEvent(document, '.o_field_widget[name=invoice_date] .o_datepicker_input', 'focusin');

        // Check boxes presence for date
        assert.strictEqual(attachmentPreview.querySelectorAll('.o_invoice_extract_box').length, 3,
            "there should be 3 boxes when the date field is focused");
        assert.strictEqual(attachmentPreview.querySelectorAll('.o_invoice_extract_box[data-field-name=date]').length, 3,
            "there should be 3 boxes with field name date");

        // Click on the date box with ID 12
        await click(attachmentPreview, '.o_invoice_extract_box[data-id="12"]', { skipVisibilityCheck: true });
        assert.strictEqual(document.querySelector('.o_field_widget[name=invoice_date] input').value, "01/01/2022",
            "the date field should be filled according to the content of the box clicked");

        // ---------- Due date ----------

        // Focus the field
        await triggerEvent(document, '.o_field_widget[name=invoice_date_due] .o_datepicker_input', 'focusin');

        // Check boxes presence for due date
        assert.strictEqual(attachmentPreview.querySelectorAll('.o_invoice_extract_box').length, 2,
            "there should be 2 boxes when the due_date field is focused");
        assert.strictEqual(attachmentPreview.querySelectorAll('.o_invoice_extract_box[data-field-name=due_date]').length, 2,
            "there should be 2 boxes with field name due_date");

        // Click on the due date box with ID 14
        await click(attachmentPreview, '.o_invoice_extract_box[data-id="14"]', { skipVisibilityCheck: true });
        assert.strictEqual(document.querySelector('.o_field_widget[name=invoice_date_due] input').value, "01/15/2022",
            "the due date field should be filled according to the content of the box clicked");

        // ---------- Currency ----------

        // Focus the field
        await triggerEvent(document, '.o_field_widget[name=currency_id] input', 'focusin');

        // Check boxes presence for currency
        assert.strictEqual(attachmentPreview.querySelectorAll('.o_invoice_extract_box').length, 2,
            "there should be 2 boxes when the currency field is focused");
        assert.strictEqual(attachmentPreview.querySelectorAll('.o_invoice_extract_box[data-field-name=currency]').length, 2,
            "there should be 2 boxes with field name currency");

        // Click on the currency box with ID 16
        await click(attachmentPreview, '.o_invoice_extract_box[data-id="16"]', { skipVisibilityCheck: true });
        assert.strictEqual(document.querySelector('.o_field_widget[name=currency_id] input').value, "EUR",
            "the currency field should be filled according to the content of the box clicked");
    });
});
});
