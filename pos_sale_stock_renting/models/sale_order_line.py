from odoo import api, models


class SaleOrderLine(models.Model):
    _inherit = 'sale.order.line'

    @api.depends('pos_order_line_ids.qty')
    def _compute_qty_delivered(self):
        super()._compute_qty_delivered()
        for sale_line in self:
            if sale_line.is_rental and sale_line.pos_order_line_ids:
                sale_line.qty_delivered = sum([self._convert_qty(sale_line, pos_line.qty, 'p2s') for pos_line in sale_line.pos_order_line_ids if sale_line.product_id.type != 'service'], 0)
